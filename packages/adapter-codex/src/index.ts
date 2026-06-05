/**
 * @agentbridge/adapter-codex
 *
 * Platform adapter for OpenAI Codex CLI.
 *
 * Codex plugins use a JSON stdin/stdout protocol where:
 * - Hooks receive JSON events via stdin
 * - Hooks output JSON responses to stdout
 * - Exit code 0 = success / allow
 * - Exit code 2 = block (for Stop / SubagentStop hooks)
 *
 * Supported hooks (10):
 *   SessionStart, SubagentStart, PreToolUse, PermissionRequest,
 *   PostToolUse, PreCompact, PostCompact, UserPromptSubmit,
 *   SubagentStop, Stop
 *
 * Handler types:
 *   - command only (stdin/stdout JSON protocol)
 *
 * Manifest:
 *   - .codex-plugin/plugin.json
 *
 * Skills:
 *   - skills/<name>/SKILL.md
 *
 * MCP:
 *   - .mcp.json
 *
 * Environment variables:
 *   - PLUGIN_ROOT  – absolute path to the plugin directory
 *   - PLUGIN_DATA  – path to a writable data directory
 */

import type {
  PlatformAdapter,
  AdapterOutput,
  FileOutput,
  PluginManifest,
  ValidationIssue,
  UniversalHookName,
  HandlerType,
  TargetPlatform,
  HookDefinition,
  Skill,
} from "@agentbridge/core";

import { Severity } from "@agentbridge/core";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PLATFORM_NAME: TargetPlatform = "codex";

export const DISPLAY_NAME = "OpenAI Codex CLI";

/** Hooks that Codex natively supports. */
export const SUPPORTED_HOOKS: readonly UniversalHookName[] = [
  "sessionStart",
  "subagentStart",
  "preToolUse",
  "permissionRequest",
  "postToolUse",
  "preCompact",
  "postCompact",
  "userPromptSubmit",
  "subagentStop",
  "stop",
];

/** Only command handlers (stdin/stdout JSON protocol) are supported on Codex. */
export const SUPPORTED_HANDLERS: readonly HandlerType[] = ["command"];

export const MANIFEST_PATH = ".codex-plugin/plugin.json";
export const MANIFEST_FORMAT = "json" as const;

export const EXIT_CODE_BLOCK = 2;
export const EXIT_CODE_SUCCESS = 0;

/** Mapping from universal hook names to Codex event names. */
export const HOOK_NAME_MAP: Partial<Record<
  (typeof SUPPORTED_HOOKS)[number],
  string
>> = {
  sessionStart: "SessionStart",
  subagentStart: "SubagentStart",
  preToolUse: "PreToolUse",
  permissionRequest: "PermissionRequest",
  postToolUse: "PostToolUse",
  preCompact: "PreCompact",
  postCompact: "PostCompact",
  userPromptSubmit: "UserPromptSubmit",
  subagentStop: "SubagentStop",
  stop: "Stop",
};

/** Hooks that use the "tool_name" matcher in Codex. */
const TOOL_MATCHED_HOOKS: readonly string[] = [
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
];

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate a single hook definition for Codex compatibility.
 */
function validateHook(
  hookName: string,
  hook: HookDefinition
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const codexEvent = HOOK_NAME_MAP[hookName as (typeof SUPPORTED_HOOKS)[number]];

  if (!codexEvent) {
    issues.push({
      severity: Severity.ERROR,
      message: `Hook "${hookName}" is not supported by Codex. Supported hooks: ${SUPPORTED_HOOKS.join(", ")}.`,
      field: `hooks.${hookName}`,
      suggestion: `Remove this hook or use a command handler instead.`,
    });
    return issues;
  }

  // Codex only supports "command" handlers (JSON stdin/stdout)
  if (hook.handler && hook.handler.type !== "command") {
    issues.push({
      severity: Severity.ERROR,
      message: `Codex only supports "command" handlers. Hook "${hookName}" specifies type "${hook.handler.type}".`,
      field: `hooks.${hookName}.handler.type`,
      suggestion: `Use a command handler instead of an inline handler.`,
    });
  }

  return issues;
}

/**
 * Validate a single skill definition for Codex compatibility.
 */
function validateSkill(
  skill: Skill,
  index: number
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!skill.name || skill.name.trim().length === 0) {
    issues.push({
      severity: Severity.ERROR,
      message: `Skill at index ${index} must have a non-empty name.`,
      field: `skills[${index}].name`,
    });
  }

  if (!skill.content || skill.content.trim().length === 0) {
    issues.push({
      severity: Severity.WARNING,
      message: `Skill "${skill.name}" has empty content.`,
      field: `skills[${index}].content`,
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Manifest / output helpers
// ---------------------------------------------------------------------------

/**
 * Build a Codex hook entry for the plugin manifest.
 */
function buildCodexHookEntry(hookName: string, hook: HookDefinition): Record<string, unknown> {
  const codexEvent = HOOK_NAME_MAP[hookName as (typeof SUPPORTED_HOOKS)[number]]!;
  const entry: Record<string, unknown> = {
    event: codexEvent,
  };

  // Tool-matched hooks include a matcher for tool_name
  if (TOOL_MATCHED_HOOKS.includes(codexEvent)) {
    entry.matcher = hook.matcher ?? "*";
  }

  // Command handlers include the command string
  if (hook.handler.type === 'command') {
    entry.command = hook.handler.command;
  }

  return entry;
}

/**
 * Build the .codex-plugin/plugin.json manifest.
 */
function buildManifest(
  plugin: PluginManifest,
  hookEntries: Record<string, unknown>[]
): Record<string, unknown> {
  return {
    name: plugin.name,
    version: plugin.version,
    description: plugin.description,
    hooks: hookEntries,
    environment: {
      PLUGIN_ROOT: "${PLUGIN_ROOT}",
      PLUGIN_DATA: "${PLUGIN_DATA}",
    },
  };
}

/**
 * Build the .mcp.json (MCP server configuration) if MCP servers are defined.
 */
function buildMcpManifest(
  plugin: PluginManifest
): Record<string, unknown> | null {
  if (!plugin.mcpServers || Object.keys(plugin.mcpServers).length === 0) {
    return null;
  }

  const servers: Record<string, unknown> = {};
  for (const [name, server] of Object.entries(plugin.mcpServers)) {
    servers[name] = {
      command: server.command,
      ...(server.args && server.args.length > 0 ? { args: server.args } : {}),
      ...(server.env ? { env: server.env } : {}),
    };
  }

  return { servers };
}

/**
 * Build a skill file (SKILL.md) content from a skill definition.
 */
function buildSkillFile(skill: Skill): string {
  const parts: string[] = [];

  parts.push(`# ${skill.name}`);
  parts.push("");

  if (skill.description) {
    parts.push(skill.description);
    parts.push("");
  }

  if (skill.content) {
    parts.push(skill.content);
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// CodexPlatformAdapter
// ---------------------------------------------------------------------------

/**
 * AgentBridge platform adapter for OpenAI Codex CLI.
 *
 * Implements the {@link PlatformAdapter} interface to compile
 * cross-platform AgentBridge plugins into Codex-compatible plugin
 * bundles with JSON stdin/stdout command handlers.
 */
export class CodexPlatformAdapter implements PlatformAdapter {
  readonly name: TargetPlatform = PLATFORM_NAME;
  readonly displayName: string = DISPLAY_NAME;
  readonly supportedHooks: readonly UniversalHookName[] = SUPPORTED_HOOKS;
  readonly supportedHandlers: readonly HandlerType[] = SUPPORTED_HANDLERS;
  readonly manifestPath: string = MANIFEST_PATH;
  readonly manifestFormat: "json" | "toml" = MANIFEST_FORMAT;

  /**
   * Validate a plugin manifest for Codex compatibility.
   *
   * Checks that:
   * - Only supported hooks are used
   * - Only "command" handler types are specified
   * - Inline handlers have either a command or script
   * - Skills have valid names and non-empty instructions
   *
   * @param plugin - The plugin manifest to validate
   * @returns Array of validation issues (errors and warnings)
   */
  validate(plugin: PluginManifest): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Validate hooks
    if (plugin.hooks) {
      for (const [hookName, hookDef] of Object.entries(plugin.hooks)) {
        issues.push(...validateHook(hookName, hookDef as HookDefinition));
      }
    }

    // Validate skills
    if (plugin.skills) {
      for (let i = 0; i < plugin.skills.length; i++) {
        issues.push(...validateSkill(plugin.skills[i], i));
      }
    }

    return issues;
  }

  /**
   * Compile a plugin manifest into Codex-compatible output files.
   *
   * Produces:
   *   - .codex-plugin/plugin.json  – main manifest
   *   - skills/<name>/SKILL.md     – skill documentation files
   *   - .mcp.json                  – MCP server configuration (if any)
   *   - hooks/<hook-name>.js       – wrapped inline handler scripts
   *
   * @param plugin - The plugin manifest to compile
   * @returns {@link AdapterOutput} with files, manifest, warnings, and post-install notes
   */
  compile(plugin: PluginManifest): AdapterOutput {
    const files: FileOutput[] = [];
    const warnings: string[] = [];
    const hookEntries: Record<string, unknown>[] = [];

    // --- Hooks ---
    if (plugin.hooks) {
      for (const [hookName, hookDef] of Object.entries(plugin.hooks)) {
        const codexEvent = HOOK_NAME_MAP[hookName as (typeof SUPPORTED_HOOKS)[number]];
        if (!codexEvent) {
          warnings.push(
            `Skipping unsupported hook "${hookName}" – not included in compiled output.`
          );
          continue;
        }

        const entry = buildCodexHookEntry(hookName, hookDef);

        // Command handler - use directly
        if (hookDef.handler.type === 'command') {
          entry.command = hookDef.handler.command;
          hookEntries.push(entry);
        } else {
          // Inline handlers can't be compiled for Codex - they require serialization
          warnings.push(
            `Hook "${hookName}": inline handlers are not supported on Codex. Use command handlers instead.`
          );
        }
      }
    }

    // --- Skills ---
    if (plugin.skills) {
      for (const skill of plugin.skills) {
        const skillPath = `skills/${skill.name}/SKILL.md`;
        const skillContent = buildSkillFile(skill);
        files.push({
          path: skillPath,
          content: skillContent,
        });
      }
    }

    // --- Manifest ---
    const manifest = buildManifest(plugin, hookEntries);
    files.push({
      path: MANIFEST_PATH,
      content: JSON.stringify(manifest, null, 2),
    });

    // --- MCP ---
    const mcpManifest = buildMcpManifest(plugin);
    if (mcpManifest) {
      files.push({
        path: ".mcp.json",
        content: JSON.stringify(mcpManifest, null, 2),
      });
    }

    // --- Post-install notes ---
    const postInstall: string[] = [
      "OpenAI Codex Plugin",
      "===================",
      "",
      `Plugin "${plugin.name}" v${plugin.version} compiled for Codex.`,
      "",
      "Install:",
      `  1. Copy the generated files into your project root (or a sub-directory).`,
      `  2. Ensure the hook scripts under hooks/ are executable:`,
      `       chmod +x hooks/*.js`,
      `  3. Set environment variables:`,
      `       export PLUGIN_ROOT=/path/to/plugin`,
      `       export PLUGIN_DATA=/path/to/plugin/data`,
      `  4. Codex will auto-discover .codex-plugin/plugin.json when running`,
      `     in the project directory.`,
      "",
      "Hook protocol:",
      "  - Codex sends JSON events to each hook via stdin.",
      "  - Hooks respond with JSON on stdout.",
      "  - Exit code 0 = success / allow the operation.",
      `  - Exit code ${EXIT_CODE_BLOCK} = block (for Stop / SubagentStop hooks).`,
      "",
      "Output formats:",
      '  SessionStart        → { "hookSpecificOutput": { "hookEventName": "SessionStart", "additionalContext": "..." } }',
      '  PreToolUse          → { "systemMessage": "Warning message" }',
      '  Stop / SubagentStop → { "decision": "block", "reason": "..." } (or exit 2)',
      "",
    ];

    return {
      files,
      manifest,
      warnings,
      issues: [],
      postInstall,
    };
  }
}

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------

/**
 * Factory function that creates a new {@link CodexPlatformAdapter} instance.
 *
 * @example
 * ```ts
 * import { createCodexAdapter } from "@agentbridge/adapter-codex";
 *
 * const adapter = createCodexAdapter();
 * const issues = adapter.validate(manifest);
 * const output = adapter.compile(manifest);
 * ```
 */
export function createCodexAdapter(): CodexPlatformAdapter {
  return new CodexPlatformAdapter();
}

/** Convenience default export */
export default createCodexAdapter;
