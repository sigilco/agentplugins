/**
 * AgentPlugins Validation Layer
 *
 * Catches cross-platform issues before compilation.
 * Provides platform-specific and universal validators.
 */

import {
  type PluginManifest,
  type ValidationIssue,
  type UniversalHookName,
  type HookHandler,
  UNIVERSAL_HOOK_NAMES,
  ALL_TARGETS,
  type TargetPlatform,
  Severity,
} from './types.js';

// ─── Universal Validators ─────────────────────────────────────────────────────

const KEBAB_CASE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function validateUniversal(plugin: PluginManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // ─── name ─────────────────────────────────────────────────────────────────
  if (!plugin.name) {
    issues.push({ severity: Severity.ERROR, field: 'name', message: 'Plugin name is required' });
  } else {
    if (!KEBAB_CASE_RE.test(plugin.name)) {
      issues.push({
        severity: Severity.ERROR,
        field: 'name',
        message: `Plugin name "${plugin.name}" must be kebab-case (lowercase letters, numbers, hyphens only)`,
        suggestion: `Rename to: ${toKebabCase(plugin.name)}`,
      });
    }
    if (plugin.name.length > 64) {
      issues.push({
        severity: Severity.ERROR,
        field: 'name',
        message: `Plugin name "${plugin.name}" is ${plugin.name.length} chars (max 64)`,
      });
    }
  }

  // ─── version ──────────────────────────────────────────────────────────────
  if (!plugin.version) {
    issues.push({ severity: Severity.ERROR, field: 'version', message: 'Plugin version is required' });
  } else if (!SEMVER_RE.test(plugin.version)) {
    issues.push({
      severity: Severity.ERROR,
      field: 'version',
      message: `Version "${plugin.version}" is not valid semantic versioning`,
      suggestion: 'Use format like "1.0.0"',
    });
  }

  // ─── description ──────────────────────────────────────────────────────────
  if (!plugin.description) {
    issues.push({ severity: Severity.WARNING, field: 'description', message: 'Description is recommended for discovery' });
  } else if (plugin.description.length > 1024) {
    issues.push({
      severity: Severity.WARNING,
      field: 'description',
      message: `Description is ${plugin.description.length} chars (some platforms truncate at 1024)`,
    });
  }

  // ─── targets ──────────────────────────────────────────────────────────────
  if (plugin.targets) {
    for (const target of plugin.targets) {
      if (!ALL_TARGETS.includes(target)) {
        issues.push({
          severity: Severity.ERROR,
          field: 'targets',
          message: `Unknown target platform: "${target}"`,
          suggestion: `Supported: ${ALL_TARGETS.join(', ')}`,
        });
      }
    }
  }

  // ─── hooks ────────────────────────────────────────────────────────────────
  if (plugin.hooks) {
    for (const [name, def] of Object.entries(plugin.hooks)) {
      const hookName = name as UniversalHookName;
      if (!UNIVERSAL_HOOK_NAMES.includes(hookName)) {
        issues.push({
          severity: Severity.WARNING,
          field: `hooks.${name}`,
          message: `Hook "${name}" is not a universal hook — it will be ignored by some platforms`,
        });
        continue;
      }
      if (def) {
        issues.push(...validateHandler(hookName, def.handler));
      }
    }
  }

  // ─── skills ───────────────────────────────────────────────────────────────
  if (plugin.skills) {
    for (let i = 0; i < plugin.skills.length; i++) {
      const skill = plugin.skills[i];
      if (!skill.name) {
        issues.push({ severity: Severity.ERROR, field: `skills[${i}].name`, message: 'Skill name is required' });
      } else if (!KEBAB_CASE_RE.test(skill.name)) {
        issues.push({
          severity: Severity.WARNING,
          field: `skills[${i}].name`,
          message: `Skill name "${skill.name}" should be kebab-case`,
          suggestion: `Rename to: ${toKebabCase(skill.name)}`,
        });
      }
      if (!skill.description) {
        issues.push({ severity: Severity.WARNING, field: `skills[${i}].description`, message: 'Skill description is recommended' });
      }
      if (!skill.content && !skill.filePath) {
        issues.push({
          severity: Severity.ERROR,
          field: `skills[${i}]`,
          message: 'Skill must have either "content" or "filePath"',
        });
      }
    }
  }

  // ─── tools ────────────────────────────────────────────────────────────────
  if (plugin.tools) {
    for (let i = 0; i < plugin.tools.length; i++) {
      const tool = plugin.tools[i];
      if (!tool.name) {
        issues.push({ severity: Severity.ERROR, field: `tools[${i}].name`, message: 'Tool name is required' });
      }
      if (!tool.description) {
        issues.push({ severity: Severity.WARNING, field: `tools[${i}].description`, message: 'Tool description is recommended' });
      }
      // Tool handlers are runtime functions, not HookHandler objects
      // This check only applies to hooks, not tools
      if ((tool as any).handlerType === 'inline' && (tool as any).handlerImpl === undefined) {
        issues.push({
          severity: Severity.WARNING,
          field: `tools[${i}].handler`,
          message: 'Tool has no handler — will be a no-op on platforms without native tool support',
        });
      }
    }
  }

  return issues;
}

function validateHandler(hookName: string, handler: HookHandler): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  switch (handler.type) {
    case 'command': {
      if (!handler.command) {
        issues.push({ severity: Severity.ERROR, field: `hooks.${hookName}.command`, message: 'Command string is required' });
      }
      // Check for dangerous patterns
      if (handler.command?.includes('rm -rf /')) {
        issues.push({ severity: Severity.WARNING, field: `hooks.${hookName}.command`, message: 'Command contains dangerous pattern "rm -rf /"' });
      }
      break;
    }
    case 'http': {
      if (!handler.url) {
        issues.push({ severity: Severity.ERROR, field: `hooks.${hookName}.url`, message: 'HTTP URL is required' });
      } else {
        // Basic URL validation using pattern check
        const urlPattern = /^https?:\/\/.+/;
        if (!urlPattern.test(handler.url)) {
          issues.push({ severity: Severity.ERROR, field: `hooks.${hookName}.url`, message: `Invalid URL: ${handler.url}` });
        }
      }
      break;
    }
    case 'inline': {
      if (typeof handler.handler !== 'function') {
        issues.push({ severity: Severity.ERROR, field: `hooks.${hookName}.handler`, message: 'Inline handler must be a function' });
      }
      break;
    }
    default: {
      issues.push({ severity: Severity.ERROR, field: `hooks.${hookName}.type`, message: `Unknown handler type` });
    }
  }

  return issues;
}

// ─── Platform-Specific Validation Helpers ────────────────────────────────────

export interface PlatformConstraints {
  maxNameLength: number;
  supportsHttpHandler: boolean;
  supportsInlineHandler: boolean;
  supportsPromptHandler: boolean;
  supportsMCPToolHandler: boolean;
  maxDescriptionLength: number;
  supportedHooks: readonly UniversalHookName[];
  manifestPath: string;
  requiresStrictValidation: boolean;
  notes: string[];
}

export function getPlatformConstraints(platform: TargetPlatform): PlatformConstraints {
  const base: Record<TargetPlatform, PlatformConstraints> = {
    claude: {
      maxNameLength: 64,
      supportsHttpHandler: true,
      supportsInlineHandler: false,
      supportsPromptHandler: true,
      supportsMCPToolHandler: true,
      maxDescriptionLength: 1024,
      supportedHooks: [
        'sessionStart', 'sessionEnd', 'userPromptSubmit', 'userPromptExpansion',
        'preToolUse', 'postToolUse', 'postToolUseFailure', 'permissionRequest',
        'permissionDenied', 'subagentStart', 'subagentStop', 'preCompact',
        'postCompact', 'stop', 'stopFailure', 'notification', 'fileChanged',
        'cwdChanged', 'setup',
      ],
      manifestPath: '.claude-plugin/plugin.json',
      requiresStrictValidation: false,
      notes: ['5 handler types: command, http, mcp_tool, prompt, agent'],
    },
    codex: {
      maxNameLength: 64,
      supportsHttpHandler: false,
      supportsInlineHandler: false,
      supportsPromptHandler: false,
      supportsMCPToolHandler: false,
      maxDescriptionLength: 1024,
      supportedHooks: [
        'sessionStart', 'subagentStart', 'preToolUse', 'permissionRequest',
        'postToolUse', 'preCompact', 'postCompact', 'userPromptSubmit',
        'subagentStop', 'stop',
      ],
      manifestPath: '.codex-plugin/plugin.json',
      requiresStrictValidation: false,
      notes: ['Hooks are command-based only (JSON stdin/stdout)'],
    },
    copilot: {
      maxNameLength: 64,
      supportsHttpHandler: true,
      supportsInlineHandler: false,
      supportsPromptHandler: true,
      supportsMCPToolHandler: false,
      maxDescriptionLength: 1024,
      supportedHooks: [
        'sessionStart', 'sessionEnd', 'userPromptSubmit', 'preToolUse',
        'postToolUse', 'postToolUseFailure', 'subagentStart', 'subagentStop',
        'stop', 'preCompact', 'permissionRequest', 'notification',
      ],
      manifestPath: 'plugin.json',
      requiresStrictValidation: true,
      notes: ['preToolUse is fail-closed: errors/timeouts deny tool calls'],
    },
    gemini: {
      maxNameLength: 64,
      supportsHttpHandler: false,
      supportsInlineHandler: false,
      supportsPromptHandler: false,
      supportsMCPToolHandler: false,
      maxDescriptionLength: 1024,
      supportedHooks: [
        'sessionStart', 'preToolUse', 'postToolUse', 'preCompact',
        'notification', 'userPromptSubmit', 'subagentStart', 'subagentStop',
        'stop',
      ],
      manifestPath: 'gemini-extension.json',
      requiresStrictValidation: true,
      notes: ['Uses exit codes: 0=success, 2=block, other=warning'],
    },
    kimi: {
      maxNameLength: 64,
      supportsHttpHandler: true,
      supportsInlineHandler: false,
      supportsPromptHandler: false,
      supportsMCPToolHandler: false,
      maxDescriptionLength: 1024,
      supportedHooks: [
        'sessionStart', 'userPromptSubmit', 'preToolUse', 'permissionRequest',
        'notification', 'stop',
      ],
      manifestPath: 'kimi.plugin.json',
      requiresStrictValidation: true,
      notes: ['Hooks are fail-open (not fail-closed like Copilot)'],
    },
    opencode: {
      maxNameLength: 64,
      supportsHttpHandler: false,
      supportsInlineHandler: true,
      supportsPromptHandler: false,
      supportsMCPToolHandler: false,
      maxDescriptionLength: 1024,
      supportedHooks: [
        'sessionStart', 'sessionEnd', 'preToolUse', 'postToolUse',
        'permissionRequest', 'notification', 'preCompact', 'stop',
      ],
      manifestPath: 'package.json', // Uses npm package.json + opencode.json
      requiresStrictValidation: false,
      notes: ['TypeScript-native, inline handlers only. Bun runtime.'],
    },
    pimono: {
      maxNameLength: 64,
      supportsHttpHandler: false,
      supportsInlineHandler: true,
      supportsPromptHandler: false,
      supportsMCPToolHandler: false,
      maxDescriptionLength: 1024,
      supportedHooks: [
        'sessionStart', 'sessionEnd', 'userPromptSubmit', 'preToolUse',
        'postToolUse', 'permissionRequest', 'subagentStart', 'subagentStop',
        'preCompact', 'postCompact', 'stop', 'stopFailure', 'notification',
        'setup',
      ],
      manifestPath: 'package.json', // Uses package.json with "pi" key
      requiresStrictValidation: false,
      notes: ['TypeScript-native, inline handlers only. Uses ExtensionAPI pattern.'],
    },
  };

  return base[platform];
}

export function validateForPlatform(
  plugin: PluginManifest,
  platform: TargetPlatform
): ValidationIssue[] {
  const constraints = getPlatformConstraints(platform);
  const issues: ValidationIssue[] = [];

  // Check unsupported hooks
  if (plugin.hooks) {
    for (const [name, def] of Object.entries(plugin.hooks)) {
      const hookName = name as UniversalHookName;
      if (!def) continue;

      if (!constraints.supportedHooks.includes(hookName)) {
        issues.push({
          severity: Severity.WARNING,
          field: `hooks.${hookName}`,
          message: `"${hookName}" is not supported by ${platform} — this hook will be ignored`,
          suggestion: findNearestEquivalent(hookName, constraints.supportedHooks),
        });
      }

      // Check handler type compatibility
      const handler = def.handler;
      if (handler.type === 'http' && !constraints.supportsHttpHandler) {
        issues.push({
          severity: Severity.ERROR,
          field: `hooks.${hookName}.handler`,
          message: `HTTP handlers are not supported by ${platform}`,
          suggestion: 'Use "command" or "inline" handler type instead',
        });
      }
      if (handler.type === 'inline' && !constraints.supportsInlineHandler) {
        issues.push({
          severity: Severity.INFO,
          field: `hooks.${hookName}.handler`,
          message: `Inline handlers on ${platform} will be auto-wrapped as command scripts`,
        });
      }
    }
  }

  // Check name length
  if (plugin.name && plugin.name.length > constraints.maxNameLength) {
    issues.push({
      severity: Severity.ERROR,
      field: 'name',
      message: `Name "${plugin.name}" (${plugin.name.length} chars) exceeds ${platform} limit of ${constraints.maxNameLength}`,
    });
  }

  // Check description length
  if (plugin.description && plugin.description.length > constraints.maxDescriptionLength) {
    issues.push({
      severity: Severity.WARNING,
      field: 'description',
      message: `Description may be truncated on ${platform} (max ${constraints.maxDescriptionLength} chars)`,
    });
  }

  return issues;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase()
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function findNearestEquivalent(
  hook: UniversalHookName,
  supported: readonly UniversalHookName[]
): string | undefined {
  // Map of known equivalents
  const equivalents: Partial<Record<UniversalHookName, UniversalHookName>> = {
    userPromptExpansion: 'userPromptSubmit',
    permissionDenied: 'permissionRequest',
    postToolUseFailure: 'postToolUse',
    setup: 'sessionStart',
    cwdChanged: 'fileChanged',
    stopFailure: 'stop',
  };

  const equiv = equivalents[hook];
  if (equiv && supported.includes(equiv)) {
    return `Use "${equiv}" instead, which is supported by this platform`;
  }

  return undefined;
}
