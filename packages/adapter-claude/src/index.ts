/**
 * AgentBridge Claude Code Adapter
 *
 * Compiles universal AgentBridge plugins into Claude Code's native plugin format.
 *
 * Claude Code uses:
 *   - `.claude-plugin/plugin.json` — manifest
 *   - `hooks/hooks.json` — hook configuration with matchers
 *   - `skills/<name>/SKILL.md` — skill documentation (YAML frontmatter + markdown)
 *   - `.mcp.json` — MCP server configurations
 *   - `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` — env var placeholders
 *
 * Handler mapping:
 *   - command     → native command handler
 *   - http        → native HTTP handler
 *   - mcp_tool    → Claude's MCP tool handler (emitted in hooks.json)
 *   - prompt      → Claude's prompt handler (emitted in hooks.json)
 *   - agent       → Claude's agent handler (emitted in hooks.json)
 *   - inline      → auto-wrapped as Node.js command script
 *
 * All 19 universal hooks are supported by Claude Code.
 */

import {
  type PlatformAdapter,
  type PluginManifest,
  type AdapterOutput,
  type FileOutput,
  type ValidationIssue,
  type UniversalHookName,
  type HandlerType,
  type HookDefinition,
  type InlineHookHandler,
  type HookContext,
  type HookResult,
  generateHookWrapper,
  generateHandlersModule,
  validateForPlatform,
  type TargetPlatform,
  Severity,
} from '@agentbridge/core';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Every universal hook name — Claude Code supports all 19. */
const CLAUDE_SUPPORTED_HOOKS: readonly UniversalHookName[] = [
  'sessionStart',
  'sessionEnd',
  'userPromptSubmit',
  'userPromptExpansion',
  'preToolUse',
  'postToolUse',
  'postToolUseFailure',
  'permissionRequest',
  'permissionDenied',
  'subagentStart',
  'subagentStop',
  'preCompact',
  'postCompact',
  'stop',
  'stopFailure',
  'notification',
  'fileChanged',
  'cwdChanged',
  'setup',
] as const;

/** Handler types Claude supports natively (inline is wrapped). */
const CLAUDE_SUPPORTED_HANDLERS: readonly HandlerType[] = [
  'command',
  'http',
  'inline', // auto-wrapped as command scripts
] as const;

/** Mapping from universal hook names to Claude Code event names. */
const HOOK_NAME_MAP: Record<UniversalHookName, string> = {
  sessionStart: 'SessionStart',
  sessionEnd: 'SessionEnd',
  userPromptSubmit: 'UserPromptSubmit',
  userPromptExpansion: 'UserPromptExpansion',
  preToolUse: 'PreToolUse',
  postToolUse: 'PostToolUse',
  postToolUseFailure: 'PostToolUseFailure',
  permissionRequest: 'PermissionRequest',
  permissionDenied: 'PermissionDenied',
  subagentStart: 'SubagentStart',
  subagentStop: 'SubagentStop',
  preCompact: 'PreCompact',
  postCompact: 'PostCompact',
  stop: 'Stop',
  stopFailure: 'StopFailure',
  notification: 'Notification',
  fileChanged: 'FileChanged',
  cwdChanged: 'CwdChanged',
  setup: 'Setup',
};

/** Claude-specific handler types beyond the universal ones. */
type ClaudeHandlerType = 'command' | 'http' | 'mcp_tool' | 'prompt' | 'agent';

/** Claude plugin manifest shape. */
interface ClaudePluginManifest {
  name: string;
  version: string;
  description: string;
  displayName?: string;
  author?: string | { name: string; email?: string; url?: string };
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  defaultEnabled?: boolean;
  /** Claude-specific: plugin root directory env var */
  root?: string;
  /** Claude-specific: plugin data directory env var */
  data?: string;
  /** User configuration schema */
  userConfig?: Record<string, ClaudeUserConfigField>;
  /** Dependencies on other plugins */
  dependencies?: string[];
  /** Theme configuration */
  themes?: ClaudeThemeConfig[];
  /** File monitors */
  monitors?: ClaudeMonitorConfig[];
  /** LSP server configuration */
  lspServers?: ClaudeLSPServerConfig[];
  /** Extra metadata allowed by Claude */
  [key: string]: unknown;
}

/** Claude user config field definition. */
interface ClaudeUserConfigField {
  type: 'string' | 'number' | 'boolean' | 'directory' | 'file';
  title: string;
  description: string;
  sensitive?: boolean;
  required?: boolean;
  default?: unknown;
  multiple?: boolean;
}

/** Claude theme configuration. */
interface ClaudeThemeConfig {
  name: string;
  path: string;
}

/** Claude file monitor configuration. */
interface ClaudeMonitorConfig {
  pattern: string;
  event: string;
}

/** Claude LSP server configuration. */
interface ClaudeLSPServerConfig {
  name: string;
  command: string;
  args?: string[];
}

/** Hook entry in Claude's hooks.json. */
interface ClaudeHookEntry {
  event: string;
  matcher?: string;
  handler: ClaudeHandlerConfig;
}

/** Handler configuration in hooks.json. */
interface ClaudeHandlerConfig {
  type: ClaudeHandlerType;
  command?: string;
  shell?: string;
  statusMessage?: string;
  url?: string;
  headers?: Record<string, string>;
  mcpTool?: string;
  mcpServer?: string;
  prompt?: string;
  agent?: string;
}

// ─── Adapter Factory ──────────────────────────────────────────────────────────

/**
 * Create a Claude Code platform adapter.
 *
 * Usage:
 * ```ts
 * import { createAdapter } from '@agentbridge/adapter-claude';
 * const adapter = createAdapter();
 * const output = adapter.compile(manifest);
 * ```
 */
export function createClaudeAdapter(): PlatformAdapter {
  return new ClaudePlatformAdapter();
}

/** @deprecated Use createClaudeAdapter instead */
export function createAdapter(): PlatformAdapter {
  return createClaudeAdapter();
}

/**
 * Default adapter instance for direct use.
 */
export { createClaudeAdapter as default };

// ─── Adapter Implementation ───────────────────────────────────────────────────

class ClaudePlatformAdapter implements PlatformAdapter {
  readonly name: TargetPlatform = 'claude';
  readonly displayName = 'Claude Code';
  readonly supportedHooks = CLAUDE_SUPPORTED_HOOKS;
  readonly supportedHandlers = CLAUDE_SUPPORTED_HANDLERS;
  readonly manifestPath = '.claude-plugin/plugin.json';
  readonly manifestFormat = 'json' as const;

  // Inline handlers are wrapped as command scripts; tracks wrapper ID -> hook name
  private inlineWrappers: Map<string, { hookName: string }> = new Map();

  // ─── Validation ────────────────────────────────────────────────────────────

  validate(plugin: PluginManifest): ValidationIssue[] {
    // Start with platform-agnostic validation from core
    const issues: ValidationIssue[] = [...validateForPlatform(plugin, 'claude')];

    // Check for inline handlers that need wrapping
    if (plugin.hooks) {
      for (const [name, def] of Object.entries(plugin.hooks)) {
        const hookName = name as UniversalHookName;
        if (!def) continue;

        if (def.handler.type === 'inline') {
          const handler = def.handler as InlineHookHandler;
          if (typeof handler.handler !== 'function') {
            issues.push({
              severity: Severity.ERROR,
              field: `hooks.${hookName}.handler`,
              message: 'Inline handler must be a function',
            });
          } else {
            issues.push({
              severity: Severity.INFO,
              field: `hooks.${hookName}.handler`,
              message: 'Inline handler will be auto-wrapped as a Claude command script',
              suggestion: 'For better performance, use a "command" or "http" handler',
            });
          }
        }

        // Validate matcher for preToolUse/postToolUse — Claude expects toolName patterns
        if (def.matcher && ['preToolUse', 'postToolUse', 'postToolUseFailure'].includes(hookName)) {
          // Claude uses the matcher as a tool name filter — basic validation
          if (def.matcher.includes('*') && !def.matcher.match(/^\*?\w+\*?$/)) {
            issues.push({
              severity: Severity.WARNING,
              field: `hooks.${hookName}.matcher`,
              message: `Matcher pattern "${def.matcher}" may not be supported by Claude for tool hooks`,
              suggestion: 'Use simple patterns like "toolName", "prefix*", or "*suffix"',
            });
          }
        }
      }
    }

    // Validate MCP servers if present
    if (plugin.mcpServers) {
      for (const [serverName, config] of Object.entries(plugin.mcpServers)) {
        if (!config.command) {
          issues.push({
            severity: Severity.ERROR,
            field: `mcpServers.${serverName}.command`,
            message: `MCP server "${serverName}" requires a command`,
          });
        }
        if (config.transport && config.transport !== 'stdio' && config.transport !== 'http') {
          issues.push({
            severity: Severity.WARNING,
            field: `mcpServers.${serverName}.transport`,
            message: `Transport "${config.transport}" may not be supported by Claude MCP`,
            suggestion: 'Use "stdio" (default) or "http"',
          });
        }
      }
    }

    // Validate skills
    if (plugin.skills) {
      for (let i = 0; i < plugin.skills.length; i++) {
        const skill = plugin.skills[i];
        if (skill.content && skill.filePath) {
          issues.push({
            severity: Severity.WARNING,
            field: `skills[${i}]`,
            message: `Skill "${skill.name}" has both content and filePath — content takes precedence`,
          });
        }
      }
    }

    // Validate userConfig types
    if (plugin.userConfig) {
      const supportedTypes = ['string', 'number', 'boolean', 'directory', 'file'];
      for (const [key, opt] of Object.entries(plugin.userConfig)) {
        if (!supportedTypes.includes(opt.type)) {
          issues.push({
            severity: Severity.WARNING,
            field: `userConfig.${key}.type`,
            message: `User config type "${opt.type}" may not be fully supported by Claude`,
            suggestion: `Supported types: ${supportedTypes.join(', ')}`,
          });
        }
      }
    }

    return issues;
  }

  // ─── Compilation ───────────────────────────────────────────────────────────

  compile(plugin: PluginManifest): AdapterOutput {
    this.inlineWrappers.clear();
    const files: FileOutput[] = [];
    const warnings: string[] = [];
    const postInstall: string[] = [];

    // ─── 1. Build plugin.json manifest ──────────────────────────────────────
    const claudeManifest = this.buildManifest(plugin);

    // ─── 2. Build hooks.json ────────────────────────────────────────────────
    const hooksConfig = this.buildHooksConfig(plugin);
    if (hooksConfig.length > 0) {
      files.push({
        path: 'hooks/hooks.json',
        content: JSON.stringify(hooksConfig, null, 2),
      });
    }

    // ─── 3. Generate wrapper scripts for inline handlers ────────────────────
    const inlineHandlers = this.extractInlineHandlers(plugin);
    if (inlineHandlers.size > 0) {
      // Generate the shared handlers module
      const handlersModule = generateHandlersModule(inlineHandlers);
      files.push({
        path: 'hooks/__agentbridge_handlers__.js',
        content: handlersModule,
      });

      // Generate individual wrapper scripts for each inline handler
      for (const [wrapperId, { hookName }] of this.inlineWrappers.entries()) {
        const wrapperScript = generateHookWrapper('./__agentbridge_handlers__.js', {
          platform: 'claude',
          hookName,
          wrapperId,
        });
        files.push({
          path: `hooks/${wrapperId}.js`,
          content: wrapperScript,
        });
      }

      warnings.push(
        `${inlineHandlers.size} inline handler(s) wrapped as command scripts. ` +
        'These require Node.js at runtime.'
      );
    }

    // ─── 4. Generate skill files ────────────────────────────────────────────
    if (plugin.skills && plugin.skills.length > 0) {
      for (const skill of plugin.skills) {
        const skillContent = this.buildSkillFile(skill);
        const skillPath = `skills/${skill.name}/SKILL.md`;
        files.push({
          path: skillPath,
          content: skillContent,
        });
      }
    }

    // ─── 5. Generate .mcp.json ──────────────────────────────────────────────
    if (plugin.mcpServers && Object.keys(plugin.mcpServers).length > 0) {
      const mcpConfig = this.buildMCPConfig(plugin);
      files.push({
        path: '.mcp.json',
        content: JSON.stringify(mcpConfig, null, 2),
      });
    }

    // ─── 6. Generate environment setup script ───────────────────────────────
    const envScript = this.buildEnvScript(plugin);
    if (envScript) {
      files.push({
        path: 'hooks/__env__.sh',
        content: envScript,
      });
    }

    // ─── Post-install instructions ──────────────────────────────────────────
    postInstall.push(
      `Copy the generated files to your Claude Code project root:`,
      `  cp -r .claude-plugin hooks/ skills/ .mcp.json <your-project>/`,
      ``,
      `Environment variables available at runtime:`,
      `  \${CLAUDE_PLUGIN_ROOT} — path to the plugin directory`,
      `  \${CLAUDE_PLUGIN_DATA}  — path to plugin data storage`,
      ``,
      `Install location: ~/.claude/plugins/ or project-local .claude-plugin/`
    );

    if (inlineHandlers.size > 0) {
      postInstall.push(
        ``,
        `NOTE: ${inlineHandlers.size} inline handler(s) require Node.js to execute.`,
        `      Wrapper scripts are in hooks/*.js`
      );
    }

    return {
      files,
      manifest: claudeManifest as Record<string, unknown>,
      warnings,
      issues: [],
      postInstall: postInstall.length > 0 ? postInstall : undefined,
    };
  }

  // ─── Internal Helpers ──────────────────────────────────────────────────────

  /**
   * Build the Claude plugin.json manifest from a universal plugin manifest.
   */
  private buildManifest(plugin: PluginManifest): ClaudePluginManifest {
    const manifest: ClaudePluginManifest = {
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      displayName: plugin.displayName,
      author: plugin.author,
      homepage: plugin.homepage,
      repository: plugin.repository,
      license: plugin.license,
      keywords: plugin.keywords,
      defaultEnabled: plugin.defaultEnabled ?? true,
      root: '${CLAUDE_PLUGIN_ROOT}',
      data: '${CLAUDE_PLUGIN_DATA}',
    };

    // Map userConfig to Claude's format (they're compatible)
    if (plugin.userConfig) {
      manifest.userConfig = Object.fromEntries(
        Object.entries(plugin.userConfig).map(([key, opt]) => [
          key,
          {
            type: opt.type,
            title: opt.title,
            description: opt.description,
            sensitive: opt.sensitive,
            required: opt.required,
            default: opt.default,
            multiple: opt.multiple,
          } as ClaudeUserConfigField,
        ])
      );
    }

    // Claude supports dependencies — add if specified
    if ((plugin as any).dependencies) {
      manifest.dependencies = (plugin as any).dependencies;
    }

    // Claude supports themes — add if specified
    if ((plugin as any).themes) {
      manifest.themes = (plugin as any).themes;
    }

    // Claude supports file monitors — add if specified
    if ((plugin as any).monitors) {
      manifest.monitors = (plugin as any).monitors;
    }

    // Claude supports LSP servers — add if specified
    if ((plugin as any).lspServers) {
      manifest.lspServers = (plugin as any).lspServers;
    }

    return manifest;
  }

  /**
   * Build the hooks.json configuration from universal hooks.
   */
  private buildHooksConfig(plugin: PluginManifest): ClaudeHookEntry[] {
    if (!plugin.hooks) return [];

    const entries: ClaudeHookEntry[] = [];

    for (const [name, def] of Object.entries(plugin.hooks)) {
      const hookName = name as UniversalHookName;
      if (!def) continue;

      // Skip unsupported hooks (shouldn't happen after validation)
      if (!this.supportedHooks.includes(hookName)) continue;

      const claudeEvent = HOOK_NAME_MAP[hookName];
      const handlerConfig = this.buildHandlerConfig(def, hookName);

      if (handlerConfig) {
        const entry: ClaudeHookEntry = {
          event: claudeEvent,
          handler: handlerConfig,
        };

        // Add matcher for tool-related hooks and if explicitly set
        if (def.matcher) {
          entry.matcher = def.matcher;
        } else if (hookName === 'preToolUse' || hookName === 'postToolUse' || hookName === 'postToolUseFailure') {
          // Default matcher: match all tools
          entry.matcher = '*';
        }

        entries.push(entry);
      }
    }

    return entries;
  }

  /**
   * Build a single handler configuration for hooks.json.
   */
  private buildHandlerConfig(def: HookDefinition, hookName: UniversalHookName): ClaudeHandlerConfig | null {
    const handler = def.handler;

    switch (handler.type) {
      case 'command': {
        return {
          type: 'command',
          command: handler.command,
          shell: handler.shell,
          statusMessage: handler.statusMessage,
        };
      }

      case 'http': {
        return {
          type: 'http',
          url: handler.url,
          headers: handler.headers,
        };
      }

      case 'inline': {
        // Wrap inline handler as a command script
        const wrapperId = `__inline_${hookName}_${this.hashId(hookName)}`;
        this.inlineWrappers.set(wrapperId, { hookName });

        return {
          type: 'command',
          command: `node "\${CLAUDE_PLUGIN_ROOT}/hooks/${wrapperId}.js"`,
          shell: 'bash',
          statusMessage: `Running ${hookName} hook...`,
        };
      }

      default: {
        // Unknown handler type — try to handle gracefully
        const unknownHandler = handler as any;
        if (unknownHandler.type === 'mcp_tool') {
          return {
            type: 'mcp_tool',
            mcpTool: unknownHandler.mcpTool || unknownHandler.tool,
            mcpServer: unknownHandler.mcpServer || unknownHandler.server,
          };
        }
        if (unknownHandler.type === 'prompt') {
          return {
            type: 'prompt',
            prompt: unknownHandler.prompt,
          };
        }
        if (unknownHandler.type === 'agent') {
          return {
            type: 'agent',
            agent: unknownHandler.agent,
          };
        }
        return null;
      }
    }
  }

  /**
   * Build a SKILL.md file with YAML frontmatter from a universal skill definition.
   */
  private buildSkillFile(skill: { name: string; description: string; content?: string; filePath?: string }): string {
    const frontmatter: Record<string, unknown> = {
      name: skill.name,
      description: skill.description,
    };

    // If skill has explicit filePath, reference it
    if (skill.filePath && !skill.content) {
      frontmatter.source = skill.filePath;
    }

    const yamlLines = Object.entries(frontmatter)
      .map(([key, value]) => {
        if (typeof value === 'string') {
          // Quote strings that contain special characters
          if (value.includes(':') || value.includes('#') || value.includes('"')) {
            return `${key}: "${value.replace(/"/g, '\\"')}"`;
          }
          return `${key}: ${value}`;
        }
        return `${key}: ${value}`;
      })
      .join('\n');

    const frontmatterBlock = `---\n${yamlLines}\n---\n`;

    // Use provided content or generate default
    if (skill.content) {
      // If content already has YAML frontmatter, use it as-is
      if (skill.content.trimStart().startsWith('---')) {
        return skill.content;
      }
      return frontmatterBlock + '\n' + skill.content;
    }

    // If only filePath is provided, generate a stub referencing it
    if (skill.filePath) {
      return (
        frontmatterBlock +
        `\n# ${skill.name}\n\n` +
        `See [${skill.filePath}](${skill.filePath}) for the full skill documentation.\n`
      );
    }

    // Fallback
    return frontmatterBlock + `\n# ${skill.name}\n\n${skill.description}\n`;
  }

  /**
   * Build the .mcp.json configuration from universal MCP server definitions.
   */
  private buildMCPConfig(plugin: PluginManifest): Record<string, unknown> {
    if (!plugin.mcpServers) return {};

    const servers: Record<string, unknown> = {};

    for (const [serverName, config] of Object.entries(plugin.mcpServers)) {
      servers[serverName] = {
        command: config.command,
        args: config.args ?? [],
        env: config.env ?? {},
        // Claude uses 'stdio' by default
        transport: config.transport ?? 'stdio',
      };
    }

    return { servers };
  }

  /**
   * Extract inline handlers that need wrapping, returning a map suitable
   * for generateHandlersModule().
   */
  private extractInlineHandlers(
    plugin: PluginManifest
  ): Map<string, (ctx: HookContext) => Promise<HookResult>> {
    const handlers = new Map<string, (ctx: HookContext) => Promise<HookResult>>();

    if (!plugin.hooks) return handlers;

    for (const [name, def] of Object.entries(plugin.hooks)) {
      const hookName = name as UniversalHookName;
      if (!def || def.handler.type !== 'inline') continue;

      const inlineHandler = def.handler as InlineHookHandler;
      if (typeof inlineHandler.handler === 'function') {
        const wrapperId = `__inline_${hookName}_${this.hashId(hookName)}`;
        handlers.set(wrapperId, inlineHandler.handler);
      }
    }

    return handlers;
  }

  /**
   * Build an environment setup script that exports CLAUDE_PLUGIN_ROOT and
   * CLAUDE_PLUGIN_DATA for use by hook scripts.
   */
  private buildEnvScript(plugin: PluginManifest): string | null {
    // Only generate if we have command handlers that might need env vars
    if (!plugin.hooks) return null;

    const hasCommandHandlers = Object.values(plugin.hooks).some(
      (def) => def?.handler.type === 'command' || def?.handler.type === 'inline'
    );

    if (!hasCommandHandlers) return null;

    return `#!/usr/bin/env bash
# AgentBridge Auto-Generated Environment Setup for Claude Code
# Plugin: ${plugin.name}
# DO NOT EDIT — This file is regenerated on each build.

# Resolve plugin root relative to this script
export CLAUDE_PLUGIN_ROOT="$(cd "$(dirname "\$0")/.." && pwd)"
export CLAUDE_PLUGIN_DATA="\${CLAUDE_PLUGIN_ROOT}/.data"

# Ensure data directory exists
mkdir -p "\${CLAUDE_PLUGIN_DATA}"
`;
  }

  /**
   * Generate a short hash for a hook name to use in wrapper script filenames.
   */
  private hashId(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36).slice(0, 6);
  }
}

// ─── Named Exports ────────────────────────────────────────────────────────────

export type {
  ClaudePluginManifest,
  ClaudeUserConfigField,
  ClaudeThemeConfig,
  ClaudeMonitorConfig,
  ClaudeLSPServerConfig,
  ClaudeHookEntry,
  ClaudeHandlerConfig,
};
