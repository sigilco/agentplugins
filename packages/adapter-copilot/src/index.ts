/**
 * @agentbridge/adapter-copilot
 *
 * GitHub Copilot CLI platform adapter for the AgentBridge plugin system.
 *
 * This adapter compiles AgentBridge {@link PluginManifest} objects into the
 * multi-file layout expected by the Copilot CLI runtime:
 *
 *   - plugin.json          – top-level manifest (strict validation, metadata)
 *   - hooks.json           – hook bindings with optional matcher filters
 *   - skills/<name>/SKILL.md – declarative skill documentation
 *   - .mcp.json            – MCP server configuration (when applicable)
 *
 * ## Supported hooks (11 / 20 universal hooks)
 * Copilot supports 13 binding points; we map 11 distinct universal hooks to
 * them.  The remaining 9 universal hooks are explicitly unsupported.
 *
 * | Universal hook        | Copilot event         | Notes |
 * |-----------------------|-----------------------|-------|
 * | sessionStart          | sessionStart          |       |
 * | sessionEnd            | sessionEnd            |       |
 * | userPromptSubmit      | userPromptSubmitted   |       |
 * | preToolUse            | preToolUse            | FAIL-CLOSED: errors/timeouts deny the tool call |
 * | postToolUse           | postToolUse           |       |
 * | postToolUseFailure    | postToolUseFailure    |       |
 * | permissionRequest     | permissionRequest     |       |
 * | subagentStart         | subagentStart         |       |
 * | subagentStop          | agentStop             | Copilot has no "subagentStop" — agentStop is the closest semantic match |
 * | preCompact            | preCompact            |       |
 * | notification          | notification          | Fire-and-forget |
 *
 * ## Supported handlers
 * | Handler type | Details |
 * |--------------|---------|
 * | command      | bash or powershell scripts executed in a subshell |
 * | http         | POST requests sent to a configured endpoint |
 * | prompt       | Inline prompt template; **only allowed for sessionStart** |
 *
 * ## Runtime constraints
 * - **preToolUse fail-closed**: any error or timeout during a `preToolUse`
 *   hook causes the tool invocation to be denied. This is a security feature.
 * - **30 s hook timeout**: hooks that do not respond within 30 s are treated
 *   as failed (for preToolUse this means the tool call is rejected).
 * - **10 KB additionalContext cap**: the combined size of all
 *   `additionalContext` objects passed to a hook must not exceed 10 KB.
 */

import {
  type PlatformAdapter,
  type PluginManifest,
  type ValidationIssue,
  type AdapterOutput,
  type AdapterFile,
  type TargetPlatform,
  type UniversalHookName,
  type HandlerType,
  type HookDefinition,
  type Skill,
  Severity,
} from "@agentbridge/core";

/* ──────────────────────────────────────────────────────────────────────────── */
/*  CONSTANTS                                                                  */
/* ──────────────────────────────────────────────────────────────────────────── */

/** Platform identifier used throughout AgentBridge. */
const PLATFORM_NAME = "copilot" as const;

/** Human-readable platform name. */
const DISPLAY_NAME = "GitHub Copilot CLI";

/** Default manifest filename; Copilot searches several parent directories. */
const MANIFEST_PATH = "plugin.json";

/** Manifest is JSON, not TOML. */
const MANIFEST_FORMAT: "json" | "toml" = "json";

/** Hooks that this adapter supports (subset of {@link UniversalHookName}). */
const SUPPORTED_HOOKS: readonly UniversalHookName[] = [
  "sessionStart",
  "sessionEnd",
  "userPromptSubmit",
  "preToolUse",
  "postToolUse",
  "postToolUseFailure",
  "permissionRequest",
  "subagentStart",
  "subagentStop",
  "preCompact",
  "notification",
];

/** Handler types that Copilot understands (includes Copilot-specific 'prompt'). */
const SUPPORTED_HANDLERS = ["command", "http", "prompt"] as const;

/** Universal hook → Copilot CLI event name. */
const HOOK_MAP: Record<UniversalHookName, string | undefined> = {
  sessionStart: "sessionStart",
  sessionEnd: "sessionEnd",
  userPromptSubmit: "userPromptSubmitted",
  preToolUse: "preToolUse",
  postToolUse: "postToolUse",
  postToolUseFailure: "postToolUseFailure",
  permissionRequest: "permissionRequest",
  subagentStart: "subagentStart",
  subagentStop: "agentStop", // Copilot has no subagentStop; agentStop is closest
  preCompact: "preCompact",
  notification: "notification",
  // Explicitly unsupported hooks
  userPromptExpansion: undefined,
  permissionDenied: undefined,
  postCompact: undefined,
  stop: undefined,
  stopFailure: undefined,
  fileChanged: undefined,
  cwdChanged: undefined,
  setup: undefined,
};

/** Hooks that are fire-and-forget (Copilot does not wait for a response). */
const FIRE_AND_FORGET_HOOKS: readonly string[] = ["notification"];

/** Hooks where errors deny the underlying operation (fail-closed). */
const FAIL_CLOSED_HOOKS: readonly string[] = ["preToolUse"];

/** Maximum allowed timeout for a hook (seconds). */
const MAX_HOOK_TIMEOUT_SECONDS = 30;

/** Maximum size of combined additionalContext data (bytes). */
const MAX_ADDITIONAL_CONTEXT_BYTES = 10 * 1024; // 10 KB

/** The only hook that may use the "prompt" handler type. */
const PROMPT_ALLOWED_HOOK: UniversalHookName = "sessionStart";

/* ──────────────────────────────────────────────────────────────────────────── */
/*  COPILIT-SPECIFIC JSON SCHEMA TYPES                                         */
/* ──────────────────────────────────────────────────────────────────────────── */

/** Shape of a single hook entry in Copilot's `hooks.json`. */
interface CopilotHookEntry {
  /** Copilot event name (e.g. "preToolUse"). */
  event: string;
  /** Path to the handler script/binary or HTTP URL. */
  handler: string;
  /** Handler type discriminator. */
  type: "command" | "http" | "prompt";
  /** Optional matcher filter (e.g. toolName for preToolUse). */
  matcher?: {
    /** Field to match on (e.g. "toolName"). */
    field: string;
    /** Regex or literal value to match (e.g. "Bash" or "Edit|Write"). */
    value: string;
  };
  /** Whether Copilot should wait for a response (default true except notification). */
  awaitResponse?: boolean;
  /** Timeout in seconds (default 30, max 30). */
  timeout?: number;
  /** Whether an error denies the operation (true for preToolUse). */
  failClosed?: boolean;
}

/** Shape of the top-level `plugin.json` manifest. */
interface CopilotPluginManifest {
  /** Schema version. */
  schemaVersion: string;
  /** Plugin identifier. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Plugin description. */
  description?: string;
  /** Semantic version. */
  version: string;
  /** Whether strict validation is enabled (default true). */
  strict?: boolean;
  /** Maximum additionalContext size in bytes. */
  maxAdditionalContextBytes?: number;
  /** Default hook timeout in seconds. */
  hookTimeoutSeconds?: number;
  /** Author / publisher information. */
  author?: string;
  /** Homepage URL. */
  homepage?: string;
  /** License identifier. */
  license?: string;
  /** Tags for discovery. */
  tags?: string[];
  /** Paths to hook definitions (relative to plugin.json). */
  hooks?: string;
  /** Paths to skill directories (relative to plugin.json). */
  skills?: string[];
  /** MCP server configuration file path. */
  mcp?: string;
}

/** Shape of `.mcp.json` when the plugin exposes MCP servers. */
interface CopilotMcpConfig {
  /** Schema version for MCP config. */
  schemaVersion: string;
  /** List of MCP server connections. */
  servers: CopilotMcpServer[];
}

/** A single MCP server entry. */
interface CopilotMcpServer {
  /** Server identifier. */
  id: string;
  /** Display name. */
  name: string;
  /** Transport type. */
  transport: "stdio" | "sse" | "http";
  /** Command to launch (for stdio). */
  command?: string;
  /** Arguments for the command (for stdio). */
  args?: string[];
  /** URL endpoint (for sse / http). */
  url?: string;
  /** Environment variables to set. */
  env?: Record<string, string>;
}

/** A compiled skill descriptor in `skills/<name>/SKILL.md` format. */
interface CopilotSkillDescriptor {
  /** Skill name. */
  name: string;
  /** Skill description. */
  description: string;
  /** Input parameters the skill accepts. */
  parameters?: Array<{
    name: string;
    type: "string" | "number" | "boolean" | "object" | "array";
    description?: string;
    required?: boolean;
  }>;
  /** Example usage prompts. */
  examples?: string[];
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  HELPER FUNCTIONS                                                           */
/* ──────────────────────────────────────────────────────────────────────────── */

/**
 * Estimate the byte size of a JSON-serialisable value.
 * Used to enforce the 10 KB additionalContext cap.
 */
function byteSize(value: unknown): number {
  try {
    return new (globalThis as unknown as { TextEncoder: new () => { encode: (s: string) => { length: number } } }).TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return 0;
  }
}

/**
 * Build a validation issue with the given severity and message.
 */
function issue(
  severity: Severity,
  message: string,
  field: string
): ValidationIssue {
  return { severity, message, field };
}

/**
 * Check whether a hook is one of the explicitly unsupported ones and return
 * an appropriate validation error if so.
 */
function checkUnsupportedHook(
  hook: UniversalHookName,
  path: string
): ValidationIssue | undefined {
  const mapped = HOOK_MAP[hook];
  if (mapped === undefined) {
    return issue(
      Severity.ERROR,
      `Hook "${hook}" is not supported by the Copilot CLI platform. ` +
        `Supported hooks: ${SUPPORTED_HOOKS.map((h) => `"${h}"`).join(", ")}.`,
      path
    );
  }
  return undefined;
}

/**
 * Validate a single handler for Copilot compatibility.
 *
 * - `command` handler: must specify `shell` (bash | powershell) and `script`.
 * - `http` handler: must specify `url`; method must be POST (Copilot only sends POST).
 * - `prompt` handler: only allowed on `sessionStart` hook; must provide `template`.
 */
function validateHandler(
  handler: HookDefinition["handler"] & {
    config?: {
      shell?: string;
      script?: string;
      command?: string;
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      template?: string;
    };
  },
  hookName: UniversalHookName,
  path: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const handlerPath = `${path}.handler`;

  if (!(SUPPORTED_HANDLERS as readonly string[]).includes(handler.type)) {
    issues.push(
      issue(
        Severity.ERROR,
        `Handler type "${handler.type}" is not supported by Copilot CLI. ` +
          `Supported types: ${SUPPORTED_HANDLERS.map((t) => `"${t}"`).join(", ")}.`,
        handlerPath
      )
    );
    return issues;
  }

  switch (handler.type as string) {
    case "command": {
      const cmd = handler.config as {
        shell?: string;
        script?: string;
        command?: string;
      };
      if (!cmd.shell) {
        issues.push(
          issue(
            Severity.ERROR,
            `Command handler must specify "shell" (e.g. "bash" or "powershell").`,
            `${handlerPath}.config.shell`
          )
        );
      } else if (!["bash", "powershell"].includes(cmd.shell)) {
        issues.push(
          issue(
            Severity.WARNING,
            `Shell "${cmd.shell}" may not be supported by all Copilot CLI environments. ` +
              `Recommended: "bash" or "powershell".`,
            `${handlerPath}.config.shell`
          )
        );
      }
      if (!cmd.script && !cmd.command) {
        issues.push(
          issue(
            Severity.ERROR,
            `Command handler must specify "script" or "command".`,
            `${handlerPath}.config`
          )
        );
      }
      break;
    }

    case "http": {
      const httpCfg = handler.config as {
        url?: string;
        method?: string;
        headers?: Record<string, string>;
      };
      if (!httpCfg.url) {
        issues.push(
          issue(
            Severity.ERROR,
            `HTTP handler must specify "url".`,
            `${handlerPath}.config.url`
          )
        );
      }
      if (httpCfg.method && httpCfg.method.toUpperCase() !== "POST") {
        issues.push(
          issue(
            Severity.ERROR,
            `Copilot CLI only supports POST for HTTP handlers. ` +
              `Found method: "${httpCfg.method}".`,
            `${handlerPath}.config.method`
          )
        );
      }
      break;
    }

    case "prompt": {
      if (hookName !== PROMPT_ALLOWED_HOOK) {
        issues.push(
          issue(
            Severity.ERROR,
            `Prompt handler type is only allowed for the "${PROMPT_ALLOWED_HOOK}" hook. ` +
              `Hook "${hookName}" cannot use a prompt handler.`,
            handlerPath
          )
        );
      }
      const promptCfg = handler.config as { template?: string };
      if (!promptCfg.template) {
        issues.push(
          issue(
            Severity.ERROR,
            `Prompt handler must specify a "template".`,
            `${handlerPath}.config.template`
          )
        );
      }
      break;
    }
  }

  return issues;
}

/**
 * Validate hook-level constraints:
 * - additionalContext must not exceed 10 KB
 * - timeout must not exceed 30 seconds
 * - preToolUse hooks should specify a matcher (toolName filter)
 */
function validateHookConstraints(
  hook: HookDefinition,
  hookName: UniversalHookName,
  path: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Cast to access Copilot-specific properties not in core types
  const copilotHook = hook as HookDefinition & {
    additionalContext?: string;
    timeout?: number;
  };

  // 10 KB additionalContext cap
  if (copilotHook.additionalContext) {
    const size = byteSize(copilotHook.additionalContext);
    if (size > MAX_ADDITIONAL_CONTEXT_BYTES) {
      issues.push(
        issue(
          Severity.ERROR,
          `additionalContext exceeds ${MAX_ADDITIONAL_CONTEXT_BYTES} bytes ` +
            `(${size} bytes found). Reduce the size of data passed to hooks.`,
          `${path}.additionalContext`
        )
      );
    }
  }

  // 30-second timeout ceiling
  if (copilotHook.timeout !== undefined && copilotHook.timeout > MAX_HOOK_TIMEOUT_SECONDS) {
    issues.push(
      issue(
        Severity.ERROR,
        `Hook timeout (${copilotHook.timeout}s) exceeds the Copilot CLI maximum ` +
          `of ${MAX_HOOK_TIMEOUT_SECONDS}s.`,
        `${path}.timeout`
      )
    );
  }

  // preToolUse matcher recommendation
  if (hookName === "preToolUse") {
    const cfg = (hook.handler as HookDefinition["handler"] & { config?: { matcher?: { field?: string; value?: string } } })?.config;
    if (!cfg?.matcher?.field || !cfg?.matcher?.value) {
      issues.push(
        issue(
          Severity.WARNING,
          `preToolUse hooks should specify a matcher (e.g. toolName: "Bash") ` +
            `to avoid intercepting every tool call. Without a matcher, the hook ` +
            `runs for ALL tools and errors will deny them (fail-closed behavior).`,
          `${path}.handler.config.matcher`
        )
      );
    }
  }

  return issues;
}

/**
 * Convert a {@link Skill} into a Copilot skill descriptor
 * and the corresponding SKILL.md file contents.
 */
function compileSkill(skill: Skill): {
  descriptor: CopilotSkillDescriptor;
  skillDir: string;
  skillMdContent: string;
} {
  // Cast to access Copilot-specific properties not in core Skill type
  const copilotSkill = skill as Skill & {
    parameters?: Array<{
      name: string;
      type: string;
      description?: string;
      required?: boolean;
    }>;
    examples?: string[];
  };

  const descriptor: CopilotSkillDescriptor = {
    name: skill.name,
    description: skill.description,
    parameters: copilotSkill.parameters?.map((p) => ({
      name: p.name,
      type: p.type as "string" | "number" | "boolean" | "object" | "array",
      description: p.description,
      required: p.required,
    })),
    examples: copilotSkill.examples,
  };

  const skillDir = `skills/${skill.name}`;

  let md = `# ${skill.name}\n\n`;
  md += `${skill.description}\n\n`;

  if (descriptor.parameters && descriptor.parameters.length > 0) {
    md += `## Parameters\n\n`;
    md += `| Name | Type | Required | Description |\n`;
    md += `|------|------|----------|-------------|\n`;
    for (const p of descriptor.parameters) {
      md += `| ${p.name} | ${p.type} | ${p.required ? "Yes" : "No"} | ${
        p.description ?? ""
      } |\n`;
    }
    md += `\n`;
  }

  if (descriptor.examples && descriptor.examples.length > 0) {
    md += `## Examples\n\n`;
    for (const ex of descriptor.examples) {
      md += `\`\`\`\n${ex}\n\`\`\`\n\n`;
    }
  }

  md += `## Metadata\n\n`;
  md += `\`\`\`json\n${JSON.stringify(descriptor, null, 2)}\n\`\`\`\n`;

  return { descriptor, skillDir, skillMdContent: md };
}

/**
 * Build a Copilot hook entry from a universal {@link HookDefinition}.
 */
function compileHookEntry(
  hookName: UniversalHookName,
  hook: HookDefinition
): CopilotHookEntry {
  const handler = hook.handler as HookDefinition["handler"] & {
    config?: {
      shell?: string;
      script?: string;
      command?: string;
      url?: string;
      template?: string;
      matcher?: { field: string; value: string };
    };
  };
  const copilotEvent = HOOK_MAP[hookName]!;

  const entry: CopilotHookEntry = {
    event: copilotEvent,
    type: handler.type as "command" | "http" | "prompt",
    handler: "",
  };

  // Resolve the handler path / URL / template
  switch (handler.type as string) {
    case "command": {
      const cfg = handler.config as {
        shell: string;
        script?: string;
        command?: string;
      };
      entry.handler = cfg.script ?? cfg.command ?? "";
      break;
    }
    case "http": {
      const cfg = handler.config as { url: string };
      entry.handler = cfg.url;
      break;
    }
    case "prompt": {
      const cfg = handler.config as { template: string };
      entry.handler = cfg.template;
      break;
    }
  }

  // Matcher filtering (primarily for preToolUse toolName filters)
  const matcher = handler.config?.matcher;
  if (matcher?.field && matcher?.value) {
    entry.matcher = {
      field: matcher.field,
      value: matcher.value,
    };
  }

  // Fire-and-forget hooks do not await a response
  if (FIRE_AND_FORGET_HOOKS.includes(copilotEvent)) {
    entry.awaitResponse = false;
  }

  // Timeout (default 30, clamped to max)
  const copilotHook = hook as HookDefinition & { timeout?: number };
  const timeout = copilotHook.timeout ?? MAX_HOOK_TIMEOUT_SECONDS;
  entry.timeout = Math.min(timeout, MAX_HOOK_TIMEOUT_SECONDS);

  // Fail-closed flag for security-sensitive hooks
  if (FAIL_CLOSED_HOOKS.includes(copilotEvent)) {
    entry.failClosed = true;
  }

  return entry;
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  COPILOT ADAPTER CLASS                                                      */
/* ──────────────────────────────────────────────────────────────────────────── */

/**
 * GitHub Copilot CLI platform adapter.
 *
 * Converts AgentBridge {@link PluginManifest} objects into the file layout
 * expected by the Copilot CLI runtime:
 *
 * ```
 * .plugin/
 *   plugin.json        – manifest
 *   hooks.json         – hook bindings
 *   skills/
 *     <skill>/
 *       SKILL.md       – declarative skill docs
 *   .mcp.json          – MCP configuration (optional)
 * ```
 *
 * @implements {PlatformAdapter}
 */
class CopilotAdapter implements PlatformAdapter {
  /** Platform identifier. */
  readonly name: TargetPlatform = PLATFORM_NAME;

  /** Human-readable display name. */
  readonly displayName: string = DISPLAY_NAME;

  /** Universal hooks supported by this adapter. */
  readonly supportedHooks: readonly UniversalHookName[] = SUPPORTED_HOOKS;

  /** Handler types understood by Copilot CLI. */
  readonly supportedHandlers: readonly HandlerType[] = SUPPORTED_HANDLERS as readonly HandlerType[];

  /** Path to the generated manifest file. */
  readonly manifestPath: string = MANIFEST_PATH;

  /** Manifest format (JSON). */
  readonly manifestFormat: "json" | "toml" = MANIFEST_FORMAT;

  /**
   * Validate a {@link PluginManifest} for Copilot CLI compatibility.
   *
   * Checks performed:
   * 1. Only supported hooks are referenced.
   * 2. Handler types are within the supported set.
   * 3. Command handlers specify shell (bash/powershell) and script/command.
   * 4. HTTP handlers use POST (the only method Copilot sends).
   * 5. Prompt handlers are only used on `sessionStart`.
   * 6. additionalContext does not exceed 10 KB.
   * 7. Hook timeouts do not exceed 30 seconds.
   * 8. preToolUse hooks are encouraged to specify a matcher.
   * 9. All referenced skills have required fields (name, description).
   *
   * @param plugin – the plugin manifest to validate
   * @returns array of validation issues (empty if fully valid)
   */
  validate(plugin: PluginManifest): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    /* ── Hook validation ──────────────────────────────────────────────────── */
    if (plugin.hooks) {
      for (const [hookName, hookDef] of Object.entries(plugin.hooks)) {
        const hookPath = `hooks.${hookName}`;
        const uHook = hookName as UniversalHookName;

        // Unsupported hook?
        const unsupported = checkUnsupportedHook(uHook, hookPath);
        if (unsupported) {
          issues.push(unsupported);
          continue;
        }

        // Validate handler definition
        if (hookDef.handler) {
          issues.push(
            ...validateHandler(
              hookDef.handler as HookDefinition["handler"] & {
                config?: {
                  shell?: string;
                  script?: string;
                  command?: string;
                  url?: string;
                  method?: string;
                  headers?: Record<string, string>;
                  template?: string;
                };
              },
              uHook,
              hookPath
            )
          );
        } else {
          issues.push(
            issue(
              Severity.ERROR,
              `Hook "${hookName}" is missing a handler definition.`,
              hookPath
            )
          );
        }

        // Validate hook constraints (context size, timeout, matcher)
        issues.push(...validateHookConstraints(hookDef, uHook, hookPath));
      }
    }

    /* ── Skill validation ─────────────────────────────────────────────────── */
    if (plugin.skills) {
      for (let i = 0; i < plugin.skills.length; i++) {
        const skill = plugin.skills[i];
        const skillPath = `skills[${i}]`;

        if (!skill.name || skill.name.trim() === "") {
          issues.push(
            issue(
              Severity.ERROR,
              `Skill at index ${i} is missing a "name".`,
              `${skillPath}.name`
            )
          );
        }
        if (!skill.description || skill.description.trim() === "") {
          issues.push(
            issue(
              Severity.ERROR,
              `Skill "${skill.name ?? `#${i}`}" is missing a "description".`,
              `${skillPath}.description`
            )
          );
        }
        // Warn on parameter type mismatches (parameters is Copilot-specific)
        const copilotSkill = skill as Skill & {
          parameters?: Array<{
            name: string;
            type: string;
            description?: string;
            required?: boolean;
          }>;
        };
        if (copilotSkill.parameters) {
          const validTypes = ["string", "number", "boolean", "object", "array"];
          for (let j = 0; j < copilotSkill.parameters.length; j++) {
            const p = copilotSkill.parameters[j];
            if (!validTypes.includes(p.type)) {
              issues.push(
                issue(
                  Severity.WARNING,
                  `Parameter "${p.name}" has type "${p.type}" which may not be ` +
                    `recognised by Copilot CLI. Valid types: ${validTypes.join(", ")}.`,
                  `${skillPath}.parameters[${j}].type`
                )
              );
            }
          }
        }
      }
    }

    /* ── Additional plugin-level checks ───────────────────────────────────── */
    // Warn if preToolUse is used without a matcher — this is a common mistake
    // that causes all tool calls to be intercepted and potentially denied.
    if (plugin.hooks?.preToolUse) {
      const preToolHandler = plugin.hooks.preToolUse.handler as
        | HookDefinition["handler"]
        | undefined;
      const matcher = (preToolHandler as { config?: { matcher?: { field: string; value: string } } })?.config?.matcher;
      if (!matcher) {
        issues.push(
          issue(
            Severity.WARNING,
            `Plugin defines a "preToolUse" hook without a matcher. ` +
              `This will intercept ALL tool calls and any error will deny them ` +
              `(fail-closed). Consider adding a matcher like ` +
              `{ field: "toolName", value: "Bash" }.`,
            `hooks.preToolUse.handler.config.matcher`
          )
        );
      }
    }

    return issues;
  }

  /**
   * Compile a {@link PluginManifest} into the Copilot CLI file layout.
   *
   * Produces:
   * - `plugin.json` – top-level manifest with metadata and file references
   * - `hooks.json`  – hook bindings mapped to Copilot event names
   * - `skills/<name>/SKILL.md` – one file per skill
   * - `.mcp.json`   – MCP server configuration (if MCP servers are defined)
   *
   * @param plugin – the validated plugin manifest
   * @returns {@link AdapterOutput} containing all generated files
   */
  compile(plugin: PluginManifest): AdapterOutput {
    const files: AdapterFile[] = [];
    const warnings: string[] = [];

    /* ── Compile hooks ────────────────────────────────────────────────────── */
    const hookEntries: CopilotHookEntry[] = [];

    if (plugin.hooks) {
      for (const [hookName, hookDef] of Object.entries(plugin.hooks)) {
        const uHook = hookName as UniversalHookName;

        // Skip unsupported hooks (should have been caught by validate, but guard here)
        if (!SUPPORTED_HOOKS.includes(uHook)) {
          warnings.push(
            `Skipping unsupported hook "${hookName}" during compilation.`
          );
          continue;
        }

        // Inline prompt handlers are embedded; command/http handlers are externalised
        const handler = hookDef.handler as (HookDefinition["handler"] & {
          config?: {
            shell?: string;
            script?: string;
            command?: string;
          };
        }) & { type: string };

        if ((handler.type as string) === "prompt") {
          // Prompt handlers are inlined into hooks.json (no separate file)
          const entry = compileHookEntry(uHook, hookDef);
          hookEntries.push(entry);
        } else {
          // External handlers: create wrapper scripts for command handlers
          // and reference URLs for HTTP handlers
          const entry = compileHookEntry(uHook, hookDef);

          if ((handler.type as string) === "command") {
            const cfg = handler.config as {
              shell: string;
              script?: string;
              command?: string;
            };

            // Generate a wrapper script for this hook
            const scriptName = `hook-${hookName}.${
              cfg.shell === "powershell" ? "ps1" : "sh"
            }`;
            const scriptContent = generateWrapperScript(cfg);

            files.push({
              path: scriptName,
              content: scriptContent,
            });

            entry.handler = `./${scriptName}`;
          }
          // HTTP handlers already have the URL set by compileHookEntry

          hookEntries.push(entry);
        }
      }
    }

    // Write hooks.json
    if (hookEntries.length > 0) {
      files.push({
        path: "hooks.json",
        content: JSON.stringify(hookEntries, null, 2),
      });
    }

    /* ── Compile skills ───────────────────────────────────────────────────── */
    const skillDirs: string[] = [];
    if (plugin.skills && plugin.skills.length > 0) {
      for (const skill of plugin.skills) {
        const { skillDir, skillMdContent } = compileSkill(skill);
        skillDirs.push(skillDir);
        files.push({
          path: `${skillDir}/SKILL.md`,
          content: skillMdContent,
        });
      }
    }

    /* ── Compile MCP configuration ────────────────────────────────────────── */
    const mcpConfig = this.buildMcpConfig(plugin);
    if (mcpConfig) {
      files.push({
        path: ".mcp.json",
        content: JSON.stringify(mcpConfig, null, 2),
      });
    }

    /* ── Build plugin.json (top-level manifest) ───────────────────────────── */
    // Cast plugin to access Copilot-specific properties not in core types
    const copilotPlugin = plugin as PluginManifest & Record<string, unknown>;
    const copilotManifest: CopilotPluginManifest = {
      schemaVersion: "1.0",
      id: (copilotPlugin.id as string) ?? copilotPlugin.name,
      name: copilotPlugin.name,
      description: copilotPlugin.description,
      version: copilotPlugin.version,
      strict: (copilotPlugin.strict as boolean | undefined) ?? true,
      maxAdditionalContextBytes: MAX_ADDITIONAL_CONTEXT_BYTES,
      hookTimeoutSeconds: MAX_HOOK_TIMEOUT_SECONDS,
      author: typeof copilotPlugin.author === "string"
        ? copilotPlugin.author
        : copilotPlugin.author?.name,
      homepage: copilotPlugin.homepage as string | undefined,
      license: copilotPlugin.license as string | undefined,
      tags: ((copilotPlugin.tags as string[] | undefined) ?? (copilotPlugin.keywords as string[] | undefined)) ?? undefined,
      ...(hookEntries.length > 0 && { hooks: "hooks.json" }),
      ...(skillDirs.length > 0 && { skills: skillDirs }),
      ...(mcpConfig && { mcp: ".mcp.json" }),
    };

    // plugin.json goes first in the file list
    files.unshift({
      path: MANIFEST_PATH,
      content: JSON.stringify(copilotManifest, null, 2),
    });

    return {
      files,
      manifest: copilotManifest as unknown as Record<string, unknown>,
      warnings: warnings.length > 0 ? warnings : [],
      issues: [],
    };
  }

  /**
   * Build an MCP server configuration object from the plugin manifest.
   *
   * If the plugin defines MCP servers (in `plugin.mcpServers`), they are
   * converted into Copilot's `.mcp.json` format.
   *
   * @param plugin – the plugin manifest
   * @returns MCP config object, or `null` if no MCP servers are defined
   */
  private buildMcpConfig(plugin: PluginManifest): CopilotMcpConfig | null {
    const servers = (plugin as unknown as { mcpServers?: Array<{
      id: string;
      name: string;
      transport: "stdio" | "sse" | "http";
      command?: string;
      args?: string[];
      url?: string;
      env?: Record<string, string>;
    }> }).mcpServers;

    if (!servers || servers.length === 0) {
      return null;
    }

    return {
      schemaVersion: "1.0",
      servers: servers.map((s) => ({
        id: s.id,
        name: s.name,
        transport: s.transport,
        ...(s.command && { command: s.command }),
        ...(s.args && { args: s.args }),
        ...(s.url && { url: s.url }),
        ...(s.env && { env: s.env }),
      })),
    };
  }
}

/**
 * Generate a POSIX / PowerShell wrapper script for a command handler.
 *
 * The wrapper:
 * - Reads hook payload from stdin (JSON)
 * - Sets any environment variables declared in the handler config
 * - Executes the user's script
 * - Writes the response (if any) to stdout as JSON
 */
function generateWrapperScript(cfg: {
  shell: string;
  script?: string;
  command?: string;
}): string {
  const scriptBody = cfg.script ?? cfg.command ?? "";

  if (cfg.shell === "powershell") {
    return `
# Auto-generated Copilot CLI hook wrapper
param(
    [Parameter(ValueFromPipeline = $true)]
    [string]$Payload
)

# Read payload from stdin if not provided as argument
if (-not $Payload) {
    $Payload = $input | Out-String
}

# Parse JSON payload
$HookData = $Payload | ConvertFrom-Json -ErrorAction SilentlyContinue

# TODO: export relevant fields as environment variables if needed
# $env:COPILOT_TOOL_NAME = $HookData.toolName

# Execute user script
${scriptBody}
`.trim();
  }

  // Bash wrapper (default)
  return `#!/usr/bin/env bash
# Auto-generated Copilot CLI hook wrapper

set -euo pipefail

# Read JSON payload from stdin
PAYLOAD="$(cat)"

# Parse payload with jq if available; otherwise pass through raw
if command -v jq &> /dev/null; then
    TOOL_NAME="$(echo "$PAYLOAD" | jq -r '.toolName // empty')"
    export COPILOT_TOOL_NAME="\${TOOL_NAME:-}"
fi

# Execute user script
${scriptBody}
`.trim();
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  SINGLETON EXPORT                                                           */
/* ──────────────────────────────────────────────────────────────────────────── */

/**
 * Singleton instance of the Copilot CLI adapter.
 *
 * Import this directly to validate and compile plugins for the
 * GitHub Copilot CLI platform:
 *
 * ```ts
 * import { copilotAdapter } from "@agentbridge/adapter-copilot";
 *
 * const issues = copilotAdapter.validate(myPlugin);
 * if (issues.length === 0) {
 *   const output = copilotAdapter.compile(myPlugin);
 *   // output.files contains plugin.json, hooks.json, skills, etc.
 * }
 * ```
 */
export const copilotAdapter = new CopilotAdapter();

/** Factory function for creating a new Copilot adapter instance. */
export function createCopilotAdapter(): PlatformAdapter {
  return new CopilotAdapter();
}

/** Convenience alias for the adapter class (useful for testing / extension). */
export { CopilotAdapter };

/** Re-export core types so consumers don't need a separate import. */
export type {
  CopilotHookEntry,
  CopilotPluginManifest,
  CopilotMcpConfig,
  CopilotMcpServer,
  CopilotSkillDescriptor,
};
