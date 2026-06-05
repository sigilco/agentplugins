/**
 * @agentbridge/adapter-kimi
 *
 * Platform adapter for Kimi (Moonshot AI) — AgentBridge plugin system.
 *
 * Kimi plugins are installed via the `/plugins install <github-url|local-path>`
 * command in the Kimi chat interface. They are **user-level only**; there is no
 * project-level scope. Any change to a plugin requires a `/new` session restart
 * to take effect.
 *
 * Architecture overview
 * ---------------------
 * - Manifest        : `kimi.plugin.json` (JSON)
 * - Hooks           : Command-based (JSON over stdin / stdout), FAIL-OPEN
 * - Skills          : Markdown files with YAML frontmatter (`SKILL.md`)
 * - Registration    : `/plugins install <url>`
 * - Security model  : Conservative loading + trust badges; hooks are *not* a
 *                     sole security barrier (they fail open)
 *
 * Supported universal hooks
 * -------------------------
 * | Universal hook       | Kimi event        |
 * |----------------------|-------------------|
 * | preToolUse           | PreToolUse        |
 * | userPromptSubmit     | UserPromptSubmit  |
 * | sessionStart         | SessionStart      |
 * | notification         | Notification      |
 * | permissionRequest    | PermissionRequest |
 *
 * Unsupported hooks (explicitly rejected during validation):
 *   sessionEnd, userPromptExpansion, postToolUse, postToolUseFailure,
 *   permissionDenied, subagentStart, subagentStop, preCompact, postCompact,
 *   stop, stopFailure, fileChanged, cwdChanged, setup
 */

import type {
  PlatformAdapter,
  PluginManifest,
  ValidationIssue,
  AdapterOutput,
  TargetPlatform,
  UniversalHookName,
  HandlerType,
  HookDefinition,
  Skill,
  FileOutput,
  UniversalHooks,
} from "@agentbridge/core";
import { Severity } from "@agentbridge/core";

/* -------------------------------------------------------------------------- */
/*                               CONSTANTS                                    */
/* -------------------------------------------------------------------------- */

/** Internal platform identifier — must match TargetPlatform union. */
const PLATFORM_NAME: TargetPlatform = "kimi";

/** Human-readable label shown in CLI/UI selectors. */
const PLATFORM_DISPLAY_NAME = "Kimi (Moonshot AI)";

/** Kimi manifest filename on disk. */
const MANIFEST_FILENAME = "kimi.plugin.json";

/** Kimi uses JSON for all configuration files. */
const MANIFEST_FORMAT: "json" = "json";

/**
 * Hooks that Kimi supports natively.
 *
 * The ordering matches the priority Kimi applies when multiple hooks are
 * registered for the same event (earlier = higher priority).
 */
const SUPPORTED_HOOKS: readonly UniversalHookName[] = [
  "preToolUse",
  "userPromptSubmit",
  "sessionStart",
  "notification",
  "permissionRequest",
];

/**
 * Kimi only supports command-based handlers (JSON over stdin/stdout).
 *
 * Inline handlers cannot be expressed in Kimi’s `command` hook schema and are
 * therefore rejected at validation time (with an explanatory issue).
 */
const SUPPORTED_HANDLERS: readonly HandlerType[] = ["command"];

/**
 * Mapping from universal hook names to Kimi-native event names.
 *
 * These strings are written into `kimi-hooks.json` and MUST stay in sync with
 * Kimi’s documented event protocol.
 */
const HOOK_NAME_MAP: Record<UniversalHookName, string> = {
  preToolUse: "PreToolUse",
  userPromptSubmit: "UserPromptSubmit",
  sessionStart: "SessionStart",
  notification: "Notification",
  permissionRequest: "PermissionRequest",
  // — unsupported mappings (not present in SUPPORTED_HOOKS) —
  sessionEnd: "SessionEnd",
  userPromptExpansion: "UserPromptExpansion",
  postToolUse: "PostToolUse",
  postToolUseFailure: "PostToolUseFailure",
  permissionDenied: "PermissionDenied",
  subagentStart: "SubagentStart",
  subagentStop: "SubagentStop",
  preCompact: "PreCompact",
  postCompact: "PostCompact",
  stop: "Stop",
  stopFailure: "StopFailure",
  fileChanged: "FileChanged",
  cwdChanged: "CwdChanged",
  setup: "Setup",
};

/** Hooks that Kimi explicitly does NOT support. */
const UNSUPPORTED_HOOKS: readonly UniversalHookName[] = [
  "sessionEnd",
  "userPromptExpansion",
  "postToolUse",
  "postToolUseFailure",
  "permissionDenied",
  "subagentStart",
  "subagentStop",
  "preCompact",
  "postCompact",
  "stop",
  "stopFailure",
  "fileChanged",
  "cwdChanged",
  "setup",
];

/* -------------------------------------------------------------------------- */
/*                            TYPE AUGMENTATION                               */
/* -------------------------------------------------------------------------- */

/**
 * Shape of the `kimi.plugin.json` manifest.
 *
 * @see https://platform.moonshot.cn/docs/plugins/kimi-plugin-json
 */
interface KimiPluginJson {
  /** Plugin machine-name (kebab-case, unique within user scope). */
  name: string;

  /** Relative path to the skills directory containing `SKILL.md` files. */
  skills: string;

  /**
   * Relative path to the session-start hook entry point.
   * Executed once when a new chat session begins.
   */
  sessionStart?: string;

  /**
   * Relative path to an MCP (Model Context Protocol) server config JSON.
   * Optional — only needed if the plugin exposes MCP-based tools.
   */
  mcpServers?: string;

  /** Display metadata shown in the Kimi plugin store / `/plugins list`. */
  interface: {
    /** Human-readable plugin name. */
    displayName: string;
    /** Short description (≤ 120 chars recommended). */
    description: string;
    /** Optional icon URL or emoji. */
    icon?: string;
  };
}

/**
 * Shape of the `kimi-hooks.json` configuration file.
 *
 * Each top-level key is a Kimi event name. Under each event lives a list of
 * matcher rules; every matching rule runs its `hooks` array in order.
 *
 * Kimi hooks are **fail-open**: if a hook process exits non-zero or times out,
 * Kimi logs the failure but continues execution. This is by design — hooks are
 * *not* a security barrier on their own.
 */
interface KimiHooksJson {
  hooks: Record<
    string,
    Array<{
      /** Glob-style matcher (`*`, `read_file`, etc.). */
      matcher: string;
      /** Ordered list of hook invocations for this matcher. */
      hooks: Array<{
        type: "command";
        command: string;
        /** Message shown in the Kimi UI while the hook runs. */
        statusMessage?: string;
      }>;
    }>
  >;
}

/**
 * Shape of a single `SKILL.md` file’s YAML frontmatter.
 */
interface SkillFrontmatter {
  name: string;
  description: string;
  version?: string;
  author?: string;
  tags?: string[];
  tools?: string[];
}

/* -------------------------------------------------------------------------- */
/*                            VALIDATION LOGIC                                */
/* -------------------------------------------------------------------------- */

/**
 * Validates a universal PluginManifest for Kimi compatibility.
 *
 * Checks performed:
 * 1. **Unsupported hooks** — every hook in `manifest.hooks` is tested against
n *    `SUPPORTED_HOOKS`. Unsupported hooks emit `error`-level issues.
 * 2. **Handler type compatibility** — only `command` handlers are allowed.
 *    Inline (`function`) handlers emit `error`-level issues with a suggestion
 *    to wrap them in a small CLI stub.
 * 3. **Manifest completeness** — `name`, `version`, and `description` must be
 *    present and non-empty.
 * 4. **Hook configuration** — command strings must be non-empty.
 * 5. **Skill validation** — skills must have `name` and `description`.
 *
 * Kimi hooks are **fail-open**, so we warn when a hook looks like it is trying
 * to act as a security gate (e.g., naming containing “security”, “block”).
 *
 * @param manifest — The universal plugin manifest to validate.
 * @returns Array of validation issues (empty = fully compatible).
 */
function validateForKimi(manifest: PluginManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  /* —— 1. Required manifest fields —— */
  if (!manifest.name || manifest.name.trim().length === 0) {
    issues.push({
      severity: Severity.ERROR,
      field: "name",
      message: "Plugin 'name' is required for kimi.plugin.json.",
    });
  } else if (!/^[a-z0-9-]+$/.test(manifest.name)) {
    issues.push({
      severity: Severity.WARNING,
      field: "name",
      message:
        "Plugin name should be kebab-case (lowercase letters, numbers, hyphens) for best compatibility with Kimi.",
    });
  }

  if (!manifest.version || manifest.version.trim().length === 0) {
    issues.push({
      severity: Severity.ERROR,
      field: "version",
      message: "Plugin 'version' is required.",
    });
  }

  if (!manifest.description || manifest.description.trim().length === 0) {
    issues.push({
      severity: Severity.WARNING,
      field: "description",
      message:
        "Plugin 'description' is recommended for Kimi interface metadata.",
    });
  }

  /* —— 2. Hook support validation —— */
  if (manifest.hooks) {
    for (const [hookName, hook] of Object.entries(manifest.hooks)) {
      if (!hook) continue;

      if (UNSUPPORTED_HOOKS.includes(hookName as UniversalHookName)) {
        issues.push({
          severity: Severity.ERROR,
          field: `hooks.${hookName}`,
          message: `Hook "${hookName}" is not supported by Kimi. ` +
            `Supported hooks: ${SUPPORTED_HOOKS.join(", ")}. ` +
            `Consider refactoring to use a supported hook or removing it.`,
        });
        continue;
      }

      if (!SUPPORTED_HOOKS.includes(hookName as UniversalHookName)) {
        issues.push({
          severity: Severity.ERROR,
          field: `hooks.${hookName}`,
          message: `Unknown hook "${hookName}". Kimi supports: ${SUPPORTED_HOOKS.join(", ")}.`,
        });
        continue;
      }

      /* —— 3. Handler type validation —— */
      if (hook.handler) {
        if (hook.handler.type === "inline") {
          issues.push({
            severity: Severity.ERROR,
            field: `hooks.${hookName}.handler`,
            message:
              `Kimi does not support inline/function handlers for "${hookName}". ` +
              `Wrap the logic in a CLI command and set handler.type to "command" ` +
              `(e.g., "node ./hooks/${hookName}.js").`,
          });
        } else if (hook.handler.type === "command") {
          if (
            !hook.handler.command ||
            hook.handler.command.trim().length === 0
          ) {
            issues.push({
              severity: Severity.ERROR,
              field: `hooks.${hookName}.handler.command`,
              message: `Command handler for "${hookName}" has an empty command string.`,
            });
          }

          /* Warn if the hook name suggests security intent */
          const securityKeywords = ["security", "block", "deny", "prevent", "guard"];
          const lowerHookName = hookName.toLowerCase();
          if (securityKeywords.some((k) => lowerHookName.includes(k))) {
            issues.push({
              severity: Severity.WARNING,
              field: `hooks.${hookName}`,
              message:
                `Hook "${hookName}" appears security-oriented. ` +
                `Kimi hooks are FAIL-OPEN (not a sole security barrier). ` +
                `Do not rely on this hook for access control.`,
            });
          }
        } else if (hook.handler.type !== "http") {
          issues.push({
            severity: Severity.ERROR,
            field: `hooks.${hookName}.handler.type`,
            message: `Kimi does not support handler type "${hook.handler.type}". ` +
              `Use "command" instead.`,
          });
        }
      }

      /* —— 4. Blocking validation —— */
      if ((hook as Record<string, unknown>).blocking && hookName !== "preToolUse") {
        issues.push({
          severity: Severity.WARNING,
          field: `hooks.${hookName}.blocking`,
          message:
            `Only "preToolUse" supports blocking semantics in Kimi. ` +
            `Hook "${hookName}" marked blocking=true but will run non-blocking.`,
        });
      }
    }
  }

  /* —— 5. Skill validation —— */
  if (manifest.skills && manifest.skills.length > 0) {
    for (let i = 0; i < manifest.skills.length; i++) {
      const skill = manifest.skills[i];
      if (!skill.name || skill.name.trim().length === 0) {
        issues.push({
          severity: Severity.ERROR,
          field: `skills[${i}].name`,
          message: `Skill at index ${i} is missing a name.`,
        });
      }
      if (!skill.description || skill.description.trim().length === 0) {
        issues.push({
          severity: Severity.WARNING,
          field: `skills[${i}].description`,
          message: `Skill "${skill.name || `#${i}`}" is missing a description.`,
        });
      }
    }
  }

  return issues;
}

/* -------------------------------------------------------------------------- */
/*                            COMPILATION LOGIC                               */
/* -------------------------------------------------------------------------- */

/**
 * Compiles a universal PluginManifest into Kimi-specific output artifacts.
 *
 * Generated files:
 * 1. `kimi.plugin.json` — Main manifest (name, skills path, sessionStart,
 *    mcpServers, interface metadata).
 * 2. `kimi-hooks.json` — Hook configuration with command-based invocations
 *    mapped to Kimi event names.
 * 3. `skills/SKILL__{name}.md` — One Markdown file per skill with YAML
 *    frontmatter.
 *
 * @param manifest — The universal plugin manifest to compile.
 * @returns AdapterOutput containing all files to be written to disk.
 */
function compileForKimi(manifest: PluginManifest): AdapterOutput {
  const files: FileOutput[] = [];

  /* —— 1. Build kimi.plugin.json —— */
  const pluginJson: KimiPluginJson = {
    name: manifest.name,
    skills: "./skills",
    interface: {
      displayName: manifest.displayName || manifest.name,
      description: manifest.description || "",
    },
  };

  // sessionStart hook maps directly to the sessionStart field
  const sessionStartHook = manifest.hooks?.sessionStart;
  if (sessionStartHook?.handler?.type === "command") {
    pluginJson.sessionStart = sessionStartHook.handler.command;
  }

  // mcpServers is optional — only include if the manifest references MCP
  if (manifest.mcpServers && Object.keys(manifest.mcpServers).length > 0) {
    pluginJson.mcpServers = "./mcp.json";
  }

  files.push({
    path: MANIFEST_FILENAME,
    content: JSON.stringify(pluginJson, null, 2),
  });

  /* —— 2. Build kimi-hooks.json —— */
  const hooksJson = buildHooksJson(manifest.hooks || {});

  // Only emit hooks file if there's at least one supported hook
  if (Object.keys(hooksJson.hooks).length > 0) {
    files.push({
      path: "kimi-hooks.json",
      content: JSON.stringify(hooksJson, null, 2),
    });
  }

  /* —— 3. Generate skill Markdown files —— */
  if (manifest.skills && manifest.skills.length > 0) {
    for (const skill of manifest.skills) {
      const skillFile = compileSkillToMarkdown(skill);
      files.push(skillFile);
    }
  }

  /* —— 4. Generate README note about installation —— */
  files.push({
    path: "KIMI_INSTALL.md",
    content: generateInstallInstructions(manifest),
  });

  return {
    files,
    manifest: {},
    warnings: [],
    issues: [],
  };
}

/**
 * Builds the `kimi-hooks.json` configuration from universal hook definitions.
 *
 * Only hooks present in `SUPPORTED_HOOKS` are included. Each hook becomes a
 * top-level event key with a wildcard matcher (`*`) and the command to execute.
 *
 * preToolUse hooks that are marked `blocking` will include a special comment
 * in the statusMessage noting their blocking intent (even though Kimi handles
 * blocking via the protocol level for PreToolUse).
 *
 * @param hooks — Universal hook definitions from the manifest.
 * @returns The Kimi hooks configuration object.
 */
function buildHooksJson(hooks: UniversalHooks): KimiHooksJson {
  const hooksConfig: KimiHooksJson = { hooks: {} };

  for (const [hookName, hook] of Object.entries(hooks)) {
    if (!hook) continue;
    const universalName = hookName as UniversalHookName;

    // Skip unsupported hooks (they should have been caught by validate)
    if (!SUPPORTED_HOOKS.includes(universalName)) {
      continue;
    }

    // Skip sessionStart — it's handled directly in kimi.plugin.json
    if (universalName === "sessionStart") {
      continue;
    }

    const kimiEventName = HOOK_NAME_MAP[universalName];
    if (!kimiEventName) {
      continue;
    }

    // Build the command entry
    const command = extractCommand(hook, universalName);
    if (!command) {
      continue; // No valid command for this hook
    }

    const statusMessage = buildStatusMessage(hook, universalName);

    if (!hooksConfig.hooks[kimiEventName]) {
      hooksConfig.hooks[kimiEventName] = [];
    }

    hooksConfig.hooks[kimiEventName].push({
      matcher: (hook as Record<string, unknown>).matcher as string || "*",
      hooks: [
        {
          type: "command",
          command,
          statusMessage,
        },
      ],
    });
  }

  return hooksConfig;
}

/**
 * Extracts the shell command string from a universal hook definition.
 *
 * For `command` handlers, returns the command string directly.
 * For unsupported handler types, returns `null` (the hook is silently skipped
 * here because validation already emitted an error).
 *
 * @param hook — The universal hook definition.
 * @returns Shell command string, or `null` if not extractable.
 */
function extractCommand(hook: HookDefinition, hookName: string): string | null {
  if (!hook.handler) {
    return null;
  }

  if (hook.handler.type === "command") {
    return hook.handler.command || null;
  }

  // Inline/function handlers: suggest a wrapper path based on hook name
  if (hook.handler.type === "inline") {
    // Return a suggested wrapper path so the output isn't completely broken
    // (user will see the validation error and know to fix it)
    return `node ./hooks/${hookName}.js`;
  }

  return null;
}

/**
 * Builds a human-readable status message for the Kimi UI.
 *
 * Kimi displays this message while the hook process is running. For blocking
 * hooks, we note the blocking intent.
 *
 * @param hook — The universal hook definition.
 * @param universalName — The universal hook name.
 * @returns Status message string.
 */
function buildStatusMessage(
  hook: HookDefinition,
  universalName: UniversalHookName
): string | undefined {
  // User-defined status message takes precedence (from command handler)
  if (hook.handler.type === "command" && hook.handler.statusMessage) {
    return hook.handler.statusMessage;
  }

  const defaultMessages: Record<UniversalHookName, string> = {
    preToolUse: "Running pre-tool check",
    userPromptSubmit: "Processing user prompt",
    sessionStart: "Initializing plugin session",
    notification: "Handling notification",
    permissionRequest: "Requesting permission",
    sessionEnd: "Cleaning up session",
    userPromptExpansion: "Expanding prompt context",
    postToolUse: "Processing tool result",
    postToolUseFailure: "Handling tool failure",
    permissionDenied: "Processing permission denial",
    subagentStart: "Subagent starting",
    subagentStop: "Subagent stopping",
    preCompact: "Pre-compacting session",
    postCompact: "Post-compacting session",
    stop: "Stopping",
    stopFailure: "Handling stop failure",
    fileChanged: "Processing file change",
    cwdChanged: "Processing directory change",
    setup: "Running setup",
  };

  return defaultMessages[universalName];
}

/**
 * Compiles a universal SkillDefinition into a Kimi `SKILL.md` file.
 *
 * Kimi skills use YAML frontmatter followed by Markdown content. The frontmatter
 * contains metadata (name, description, version, tags, tools) and the body
 * contains the skill instructions in Markdown.
 *
 * @param skill — The universal skill definition.
 * @returns A CompiledFile ready to be written to disk.
 */
function compileSkillToMarkdown(skill: Skill): FileOutput {
  const frontmatter: SkillFrontmatter = {
    name: skill.name,
    description: skill.description,
  };

  const frontmatterYaml = Object.entries(frontmatter)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}:\n${value.map((v) => `  - ${v}`).join("\n")}`;
      }
      return `${key}: ${value}`;
    })
    .join("\n");

  const body = skill.content || skill.description || "";

  const content = `---\n${frontmatterYaml}\n---\n\n${body}\n`;

  const safeName = skill.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return {
    path: `skills/SKILL__${safeName}.md`,
    content,
  };
}

/**
 * Generates installation instructions specific to Kimi.
 *
 * Kimi plugins are installed via the `/plugins install` command and are
 * user-scoped. Changes require `/new` to restart the session.
 *
 * @param manifest — The plugin manifest.
 * @returns Markdown content for KIMI_INSTALL.md.
 */
function generateInstallInstructions(manifest: PluginManifest): string {
  const displayName = manifest.displayName || manifest.name;

  return `# Installing ${displayName} for Kimi

> Generated by AgentBridge — Kimi Platform Adapter

## Quick Install

In any Kimi chat, run:

\`\`\`
/plugins install <github-url|local-path>
\`\`\`

Replace \`<github-url|local-path>\` with the repository URL or local directory
path containing this plugin.

## Post-Install

Kimi plugins are **user-level** — they apply to all your sessions, not just the
current project.

After installing (or updating) this plugin, start a **new session** with:

\`\`\`
/new
\`\`\`

Plugin changes do **not** take effect in existing sessions.

## Important Notes

- **Fail-open hooks**: Kimi hooks are designed to fail open. If a hook process
  crashes or times out, Kimi continues execution. Do not rely on hooks as a
  sole security mechanism.

- **Trust badges**: Kimi shows trust indicators for plugins installed from
  GitHub. Install only plugins from sources you trust.

- **No project scope**: Kimi does not support project-level plugin scoping.
  All plugins are installed at the user level.

## Supported Features

This plugin uses the following Kimi features:

  ${manifest.hooks && Object.keys(manifest.hooks).length > 0
? `**Hooks**: ${Object.entries(manifest.hooks)
    .filter(([name]) => SUPPORTED_HOOKS.includes(name as UniversalHookName))
    .map(([name]) => HOOK_NAME_MAP[name as UniversalHookName] || name)
    .join(", ")}`
: "**Hooks**: (none)"
}

${manifest.skills && manifest.skills.length > 0
? `**Skills**: ${manifest.skills.map((s) => s.name).join(", ")}`
: "**Skills**: (none)"
}

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Plugin not active | Run \`/new\` to start a fresh session |
| Hook not firing | Check that the command in \`kimi-hooks.json\` is executable |
| Skill not recognized | Verify \`kimi.plugin.json\` has correct \`skills\` path |
| Changes not applied | Remember: **every change requires \`/new\`** |
`;
}

/* -------------------------------------------------------------------------- */
/*                            ADAPTER EXPORT                                  */
/* -------------------------------------------------------------------------- */

/**
 * Kimi (Moonshot AI) platform adapter for AgentBridge.
 *
 * Transforms universal AgentBridge plugins into the Kimi-native format:
 * - `kimi.plugin.json` — main manifest
 * - `kimi-hooks.json`  — command-based hook configuration
 * - `skills/SKILL__*.md` — Markdown skill files with YAML frontmatter
 *
 * ### Hook model
 * Kimi uses a **fail-open** command-based hook system. Hooks communicate with
 * Kimi via JSON messages over stdin/stdout. If a hook fails (non-zero exit,
 * timeout), Kimi logs the error but continues — hooks are not a security
 * barrier on their own.
 *
 * ### Installation flow
 * 1. User runs `/plugins install <url>` in Kimi chat
 * 2. Kimi downloads and validates `kimi.plugin.json`
 * 3. On session start (`/new`), `sessionStart` hook runs
 * 4. Registered event hooks fire as their mapped events occur
 *
 * ### Session lifecycle
 * - Plugins are **user-scoped** (no project-level isolation)
 * - Any plugin change requires `/new` session restart
 * - Hooks are re-evaluated on every session start
 *
 * @example
 * ```typescript
 * import { KimiAdapter } from "@agentbridge/adapter-kimi";
 *
 * const adapter = new KimiAdapter();
 * const issues = adapter.validate(manifest);
 * if (issues.every((i) => i.severity !== "error")) {
 *   const output = adapter.compile(manifest);
 *   // write output.files to disk...
 * }
 * ```
 */
export class KimiAdapter implements PlatformAdapter {
  /** @inheritDoc */
  readonly name: TargetPlatform = PLATFORM_NAME;

  /** @inheritDoc */
  readonly displayName: string = PLATFORM_DISPLAY_NAME;

  /** @inheritDoc */
  readonly supportedHooks: readonly UniversalHookName[] = SUPPORTED_HOOKS;

  /** @inheritDoc */
  readonly supportedHandlers: readonly HandlerType[] = SUPPORTED_HANDLERS;

  /** @inheritDoc */
  readonly manifestPath: string = MANIFEST_FILENAME;

  /** @inheritDoc */
  readonly manifestFormat: "json" = MANIFEST_FORMAT;

  /**
   * Validates a universal plugin manifest for Kimi compatibility.
   *
   * @param manifest — The plugin manifest to validate.
   * @returns Array of validation issues (empty if fully valid).
   */
  validate(manifest: PluginManifest): ValidationIssue[] {
    return validateForKimi(manifest);
  }

  /**
   * Compiles a universal plugin manifest into Kimi-native artifacts.
   *
   * @param manifest — The plugin manifest to compile.
   * @returns AdapterOutput containing all files to write.
   */
  compile(manifest: PluginManifest): AdapterOutput {
    return compileForKimi(manifest);
  }
}

/** Default adapter instance for convenience imports. */
export const kimiAdapter = new KimiAdapter();

/** Factory function for creating a new Kimi adapter instance. */
export function createKimiAdapter(): PlatformAdapter {
  return new KimiAdapter();
}

/* Re-export core types for consumer convenience */
export type {
  KimiPluginJson,
  KimiHooksJson,
  SkillFrontmatter,
};

/** Default export for ESM/CJS interoperability. */
export default KimiAdapter;
