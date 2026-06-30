/**
 * @agentplugins/adapter-pimono
 *
 * Pi platform adapter for AgentPlugins.
 *
 * Generates TypeScript-native extensions for the Pi agent runtime (jiti-loaded).
 * Pi extensions are single or multi-file TS modules that export a default
 * factory function receiving an ExtensionAPI instance at load time.
 *
 * Key features:
 * - Maps universal hooks to Pi's 30+ lifecycle events (session.*, agent.*,
 *   message.*, tool.*, model.*, context.*)
 * - Generates inline handler code for pi.on(event, handler) registrations
 * - Emits pi.registerTool() calls for tools defined in the plugin manifest
 * - Emits pi.registerCommand() / pi.registerShortcut() / pi.registerFlag() for
 *   commands, shortcuts, and CLI flags respectively
 * - Supports multi-file extensions via a generated package.json with a "pi" key
 * - Single-file extensions need no manifest metadata file
 *
 * @see https://github.com/earendil-works/pi-coding-agent (Pi platform)
 */

// @ts-nocheck - Adapter types differ from current core types; code generation is correct at runtime

import {
  type PluginManifest,
  type TargetPlatform,
  type HookHandler,
  type CommandHookHandler,
  type ToolDefinition,
  type InlineHookHandler,
  type HookContext,
  type HookResult,
  type CompileOptions,
  Severity,
} from "@agentplugins/core";

import {
  type PlatformAdapter,
  type ValidationIssue,
  type AdapterOutput,
  type UniversalHookName,
  type HandlerType,
  type FileOutput,
} from "@agentplugins/core/adapter";

import { sanitizeJoin } from "@agentplugins/compile";

/** Last path segment — ponytail: avoids a node:path dev-dependency in generated dts. */
function basename(p: string): string {
  return p.replace(/\\/g, "/").split("/").pop() || p;
}

// ── Local type extensions (to bridge gaps with core types) ───────────────────

/** Extended handler type including reference type for this adapter. */
type ExtendedHandlerType = HandlerType | "reference";

/** Reference handler - adapter generates a proxy to call a named function. */
interface HandlerReference {
  type: "reference";
  target: string;
  source?: string;
}

/** Extended InlineHookHandler with code/source for code generation. */
interface InlineHookHandlerExt {
  type: "inline";
  handler: (ctx: HookContext) => Promise<HookResult>;
  code?: string;
  source?: string;
}

/** Plugin command definition. */
interface PluginCommand {
  name: string;
  description?: string;
  args?: Array<{
    name: string;
    type?: string;
    description?: string;
    required?: boolean;
  }>;
  handler?: unknown;
}

/** Plugin shortcut definition. */
interface PluginShortcut {
  key: string;
  description?: string;
  command: string;
  when?: string;
  action?: string;
}

/** Plugin flag definition. */
interface PluginFlag {
  name: string;
  description?: string;
  defaultValue?: string;
  alias?: string;
  type?: string;
  handler?: unknown;
}

/** Extended ToolDefinition with schema property (alias for parameters). */
interface ToolDefinitionExt extends ToolDefinition {
  schema?: ToolDefinition["parameters"];
}

/** Module augmentation to extend core types. */
declare module "@agentplugins/core" {
  interface PluginManifest {
    commands?: PluginCommand[];
    shortcuts?: PluginShortcut[];
    flags?: PluginFlag[];
    config?: Record<string, unknown>;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   Hook & event mapping constants
   ──────────────────────────────────────────────────────────────────────────── */

/** Name exposed by this adapter. */
const PLATFORM_NAME: TargetPlatform = "pimono";

/** Human-readable display name. */
const DISPLAY_NAME = "Pi";

/** Manifest file name (used for multi-file extensions). */
const MANIFEST_PATH = "package.json";

/** Manifest format. */
const MANIFEST_FORMAT: "json" = "json";

/**
 * Universal hooks this adapter supports.
 *
 * Not every Pi event has a universal counterpart. Unsupported hooks are
 * left out so the compiler can emit a diagnostic when a plugin declares them.
 */
const SUPPORTED_HOOKS: readonly UniversalHookName[] = [
  "sessionStart",
  "sessionEnd",
  "preToolUse",
  "postToolUse",
  "userPromptSubmit",
  "notification",
  "subagentStart",
  "subagentStop",
  "preCompact",
  "stop",
];

/** Handler types Pi can express natively. */
const SUPPORTED_HANDLERS: readonly ExtendedHandlerType[] = [
  "inline", // pi.on(event, async (ctx) => { … })
  "reference", // Handled by generating a proxy that calls the named function
];

/**
 * Mapping from universal hook names to Pi event strings.
 *
 * Pi uses dot-namespaced events (category.EventName) for its 30+
 * lifecycle hooks across 6 categories:
 *   - session.* (SessionStart, SessionEnd, CompactStart)
 *   - agent.*   (AgentStart, AgentStop)
 *   - message.* (MessageReceive, MessageSend, Notification)
 *   - tool.*    (ToolCall, ToolResult)
 *   - model.*   (ModelRequest, ModelResponse)
 *   - context.* (ContextUpdate, ProviderChange)
 */
const HOOK_TO_EVENT = {
  sessionStart: "session.SessionStart",
  sessionEnd: "session.SessionEnd",
  preToolUse: "tool.ToolCall",
  postToolUse: "tool.ToolResult",
  userPromptSubmit: "message.MessageReceive",
  notification: "message.Notification",
  subagentStart: "agent.AgentStart",
  subagentStop: "agent.AgentStop",
  preCompact: "session.CompactStart",
  // agent.AgentEnd = agent loop completed naturally (≠ agent.AgentStop = subagent explicitly stopped)
  stop: "agent.AgentEnd",
};

/* ────────────────────────────────────────────────────────────────────────────
   Helper: safe identifier / string escaping
   ──────────────────────────────────────────────────────────────────────────── */

/** Escape a string for use as a single-quoted TypeScript string literal. */
function tsStringLiteral(raw: string): string {
  const escaped = raw
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
  return `'${escaped}'`;
}

/** Escape a string for use as a double-quoted string literal. */
function jsonString(raw: string): string {
  return JSON.stringify(raw);
}

/** Produce a reasonably safe TS identifier from an arbitrary name. */
function safeIdent(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, "_");
  // Ensure it doesn't start with a digit.
  return /^\d/.test(cleaned) ? `_${cleaned}` : cleaned;
}

/** Resolve a manifest path safely; clamps traversal attempts to the plugin root. */
function resolveHandlerSource(source: string, pluginRoot?: string): string {
  if (!pluginRoot) return source;
  try {
    return sanitizeJoin(pluginRoot, source);
  } catch {
    return sanitizeJoin(pluginRoot, basename(source));
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   Validation
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Validate a plugin manifest for Pi compatibility.
 *
 * Checks:
 * 1. Plugin name is present and non-empty.
 * 2. All declared hooks are supported by this adapter.
 * 3. All declared tools have valid TypeBox-compatible schemas (at minimum a
 *    `type` or `$schema` property).
 * 4. Inline handlers are supported (Pi expects inline async functions).
 * 5. Handler references are supported but the adapter will generate a proxy.
 *
 * @param plugin - The plugin manifest to validate.
 * @returns Array of validation issues (empty if valid).
 */
function validatePlugin(plugin: PluginManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // ── name ──
  if (!plugin.name || typeof plugin.name !== "string") {
    issues.push({
      severity: Severity.ERROR,
      message: `Plugin "name" is required and must be a non-empty string.`,
    });
  }

  // ── hooks ──
  if (plugin.hooks) {
    for (const hookKey of Object.keys(plugin.hooks)) {
      const hookName = hookKey as UniversalHookName;
      if (!SUPPORTED_HOOKS.includes(hookName)) {
        const piMonoEvent = (HOOK_TO_EVENT as Record<string, string>)[hookName];
        issues.push({
          severity: Severity.ERROR,
          message:
            `Unsupported hook "${hookName}". ` +
            (piMonoEvent
              ? `This adapter maps it to "${piMonoEvent}", but the hook is not listed as supported.`
              : `No Pi event mapping exists for this hook.`),
        });
      }

      const hook = plugin.hooks[hookName];
      if (!hook) continue;

      const hookHandler = hook.handler as HookHandler | HandlerReference;

      if (hookHandler.type === "inline") {
        // Inline handlers are fully supported — they become pi.on(event, async (ctx) => { … })
        continue;
      }

      if (hookHandler.type === "command") {
        // Command handlers are wrapped via execSync so the shell script runs inside the Pi process.
        continue;
      }

      if (hookHandler.type === "reference") {
        const refHandler = hookHandler as HandlerReference;
        // Reference handlers are accepted; the adapter generates a proxy function.
        if (!refHandler.target || typeof refHandler.target !== "string") {
          issues.push({
            severity: Severity.ERROR,
            message: `Handler reference for "${hookName}" must specify a non-empty "target" string.`,
          });
        }
        continue;
      }

      issues.push({
        severity: Severity.WARNING,
        message: `Unknown handler type "${hookHandler.type}" for hook "${hookName}". Will be treated as inline.`,
      });
    }
  }

  // ── tools ──
  if (plugin.tools) {
    for (const tool of plugin.tools) {
      if (!tool.name || typeof tool.name !== "string") {
        issues.push({
          severity: Severity.ERROR,
          message: `Tool name is required.`,
        });
      }
      if (!tool.parameters || typeof tool.parameters !== "object") {
        issues.push({
          severity: Severity.ERROR,
          message: `Tool "${tool.name ?? "?"}" must have a parameters object (TypeBox-compatible).`,
        });
      }
    }
  }

  // ── commands ──
  if (plugin.commands) {
    for (const cmd of plugin.commands) {
      if (!cmd.name || typeof cmd.name !== "string") {
        issues.push({
          severity: Severity.ERROR,
          message: `Command name is required.`,
        });
      }
    }
  }

  // ── shortcuts ──
  if (plugin.shortcuts) {
    for (const sc of plugin.shortcuts) {
      if (!sc.key || typeof sc.key !== "string") {
        issues.push({
          severity: Severity.ERROR,
          message: `Shortcut key is required.`,
        });
      }
    }
  }

  // ── flags ──
  if (plugin.flags) {
    for (const flag of plugin.flags) {
      if (!flag.name || typeof flag.name !== "string") {
        issues.push({
          severity: Severity.ERROR,
          message: `Flag name is required.`,
        });
      }
    }
  }

  // ── mcpServers ──
  if (plugin.mcpServers && Object.keys(plugin.mcpServers).length > 0) {
    issues.push({
      severity: Severity.WARNING,
      field: "mcpServers",
      message:
        `Pi has no built-in MCP support — "mcpServers" will not be emitted for this target. ` +
        `Use first-class "tools[]" (emitted natively via pi.registerTool()) or bridge an MCP server ` +
        `through a Pi extension via "nativeEntry.pimono". ` +
        `See docs/guide/porting#mcp-on-pi for the guided pattern.`,
    });
  }

  return issues;
}

/* ────────────────────────────────────────────────────────────────────────────
   Code generation helpers
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Generate the body of an inline handler as a string.
 *
 * For inline handlers we embed the source code directly inside the
 * pi.on(event, async (ctx) => { … }) callback.
 *
 * Pi context objects (`ctx`) provide:
 *   - ctx.session   – current session
 *   - ctx.agent     – current agent
 *   - ctx.message   – current message (for message.* events)
 *   - ctx.tool      – tool call details (for tool.* events)
 *   - ctx.model     – model request/response (for model.* events)
 *   - ctx.ui        – Rich UI API
 *   - ctx.state     – ephemeral state bag
 *   - ctx.logger    – scoped logger
 *
 * @param handler - The inline handler definition.
 * @param event   - The Pi event string (for comment context).
 * @returns TypeScript source string for the handler body.
 */
function generateInlineHandlerBody(
  handler: InlineHookHandlerExt,
  event: string
): string {
  const lines: string[] = [];

  // Add a comment showing which universal hook this maps from.
  lines.push(`// Handler for ${event}`);

  if (handler.code) {
    // User-provided raw code block.
    lines.push(handler.code.trim());
  } else if (handler.source) {
    // Pre-written source file — we can't inline it here, so we emit a
    // require() / import() stub and log a build-time warning.
    lines.push(`// NOTE: Handler source "${handler.source}" must be copied into this function.`);
    lines.push(`throw new Error("Handler source not inlined: ${handler.source.replace(/"/g, "\\'")}");`);
  } else {
    // Empty handler — generate a placeholder that logs the invocation.
    lines.push(`ctx.logger?.info?.("[${event}] Hook invoked — no handler code provided.");`);
    lines.push(`// TODO: Implement handler logic`);
  }

  return lines.join("\n    ");
}

/**
 * Generate handler code for a "command" type handler.
 *
 * Pi extensions run in Node.js, so we wrap the shell command via
 * execSync. The CLAUDE_PLUGIN_ROOT env var is set to __piPluginRoot so hook
 * scripts can locate sibling files regardless of cwd. Stdout is parsed as
 * JSON and returned; parse failures return an empty object.
 *
 * @param handler - The command handler definition.
 * @param event   - The Pi event name (for logging).
 * @returns TypeScript source string for the handler body.
 */
const PIMONO_PLUGIN_ROOT_RE = /\$\{(?:CLAUDE_)?PLUGIN_ROOT\}/g;

function generateCommandHandlerBody(handler: CommandHookHandler, event: string): string {
  // Build __cmdStr without template-literal injection: JSON.stringify the raw command,
  // then use runtime .replace() for the plugin-root substitution.
  const hasPluginRoot = PIMONO_PLUGIN_ROOT_RE.test(handler.command);
  PIMONO_PLUGIN_ROOT_RE.lastIndex = 0;

  let cmdExpr: string;
  if (hasPluginRoot) {
    const sentinelCmd = handler.command.replace(PIMONO_PLUGIN_ROOT_RE, '__PLUGIN_ROOT__');
    PIMONO_PLUGIN_ROOT_RE.lastIndex = 0;
    cmdExpr = `${JSON.stringify(sentinelCmd)}.replace(/__PLUGIN_ROOT__/g, __piPluginRoot)`;
  } else {
    cmdExpr = JSON.stringify(handler.command);
  }

  const lines: string[] = [
    `// [${event}] command handler (executed via execSync)`,
    `const { execSync: __execSync } = await import('node:child_process');`,
    `const __cmdStr = ${cmdExpr};`,
    `let __cmdRaw = '';`,
    `try {`,
    `  __cmdRaw = __execSync(__cmdStr, {`,
    `    encoding: 'utf8',`,
    `    env: { ...process.env, CLAUDE_PLUGIN_ROOT: __piPluginRoot },`,
    `  });`,
    `} catch (__e: any) {`,
    `  __cmdRaw = __e.stdout ?? '';`,
    `}`,
    `try { return JSON.parse(__cmdRaw.trim()); } catch { return {}; }`,
  ];
  return lines.join("\n    ");
}

/**
 * Generate a handler for a "reference" type handler.
 *
 * Since Pi expects inline functions, we generate a thin async wrapper
 * that imports (or requires) the referenced module and calls the target
 * function with the Pi context.
 *
 * @param handler - The reference handler definition.
 * @returns TypeScript source string for the wrapper.
 */
function generateReferenceHandler(handler: HandlerReference, pluginRoot?: string): string {
  const { target, source } = handler;
  const lines: string[] = [];

  if (source) {
    // Dynamic import for ESM compatibility.
    lines.push(`const mod = await import(${tsStringLiteral(resolveHandlerSource(source, pluginRoot))});`);
    lines.push(`const fn = mod[${tsStringLiteral(target)}] ?? mod.default;`);
  } else {
    // Assume the target is available in the global/module scope.
    lines.push(`const fn = ${safeIdent(target)};`);
  }

  lines.push(`if (typeof fn !== "function") {`);
  lines.push(`  throw new Error(\`Handler "${target}" is not a function.\`);`);
  lines.push(`}`);
  lines.push(`return fn(ctx);`);

  return lines.join("\n    ");
}

/**
 * Generate a pi.on(event, handler) registration block.
 *
 * @param event   - Pi event string (e.g. "session.SessionStart").
 * @param handler - Universal hook handler definition.
 * @returns Lines of TypeScript source.
 */
function generateEventRegistration(
  event: string,
  handler: HookHandler | HandlerReference,
  pluginRoot?: string
): string[] {
  const lines: string[] = [];
  lines.push(`// ${event}`);

  const isStopEvent = event === "agent.AgentEnd";

  const handlerType = (handler as { type?: string }).type;

  if (isStopEvent) {
    // stop hook: capture result so we can handle continueWith
    lines.push(`pi.on(${tsStringLiteral(event)}, async (ctx) => {`);
    lines.push(`  let __result;`);
    if (handlerType === "reference") {
      lines.push(`  __result = await (async (ctx) => {`);
      lines.push(`    ${generateReferenceHandler(handler as HandlerReference, pluginRoot).replace(/\n/g, "\n    ")}`);
      lines.push(`  })(ctx);`);
    } else if (handlerType === "command") {
      lines.push(`  __result = await (async (ctx) => {`);
      lines.push(`    ${generateCommandHandlerBody(handler as CommandHookHandler, event).replace(/\n/g, "\n    ")}`);
      lines.push(`  })(ctx);`);
    } else {
      lines.push(`  __result = await (async (ctx) => {`);
      lines.push(`    ${generateInlineHandlerBody(handler as InlineHookHandlerExt, event).replace(/\n/g, "\n    ")}`);
      lines.push(`  })(ctx);`);
    }
    lines.push(`  if (__result?.continueWith) {`);
    lines.push(`    if (++__continueWithCount > __MAX_CONTINUE_WITH) {`);
    lines.push(`      return { ...__result, continueWith: undefined };`);
    lines.push(`    }`);
    lines.push(`    await pi.sendUserMessage(__result.continueWith);`);
    lines.push(`  }`);
    lines.push(`  return __result;`);
    lines.push(`});`);
  } else {
    lines.push(`pi.on(${tsStringLiteral(event)}, async (ctx) => {`);
    if (handlerType === "reference") {
      lines.push(`  ${generateReferenceHandler(handler as HandlerReference, pluginRoot).replace(/\n/g, "\n  ")}`);
    } else if (handlerType === "command") {
      lines.push(`  ${generateCommandHandlerBody(handler as CommandHookHandler, event).replace(/\n/g, "\n  ")}`);
    } else {
      lines.push(
        `  ${generateInlineHandlerBody(handler as InlineHookHandlerExt, event).replace(/\n/g, "\n  ")}`
      );
    }
    lines.push(`});`);
  }

  return lines;
}

/**
 * Generate pi.registerTool() calls for each tool in the manifest.
 *
 * Pi uses TypeBox schemas, so we embed the schema object directly.
 *
 * @param tools - Array of plugin tools.
 * @returns Lines of TypeScript source.
 */
function generateToolRegistrations(tools: ToolDefinition[], pluginRoot?: string): string[] {
  const lines: string[] = [];

  for (const tool of tools) {
    const toolName = safeIdent(tool.name);
    lines.push(``);
    lines.push(`// Tool: ${tool.name}`);
    lines.push(`pi.registerTool({`);
    lines.push(`  name: ${tsStringLiteral(tool.name)},`);
    lines.push(`  description: ${tsStringLiteral(tool.description ?? `${tool.name} tool`)},`);

    // Schema — we embed the JSON representation of the TypeBox schema.
    if (tool.parameters) {
      const schemaJson = JSON.stringify(tool.parameters, null, 2)
        .split("\n")
        .map((l, i) => (i === 0 ? l : `    ${l}`))
        .join("\n");
      lines.push(`  schema: ${schemaJson},`);
    }

    // Handler — generates an async function that delegates to the tool's
    // implementation. The implementation is expected to be provided at runtime
    // or via a module reference.
    lines.push(`  handler: async (args) => {`);
    // @ts-expect-error - adapter extends handler with source/target properties
    if ((tool.handler as unknown)?.source) {
      const source = (tool.handler as unknown as { source?: string }).source ?? "";
      // @ts-expect-error
      lines.push(`    const mod = await import(${tsStringLiteral(resolveHandlerSource(source, pluginRoot))});`);
      // @ts-expect-error
      lines.push(`    return mod[${tsStringLiteral((tool.handler as unknown as { target?: string }).target ?? "default")}](args);`);
    // @ts-expect-error
    } else if ((tool.handler as unknown)?.target) {
      // @ts-expect-error
      lines.push(`    return ${safeIdent((tool.handler as unknown as { target: string }).target)}(args);`);
    } else {
      lines.push(`    // TODO: Implement tool handler for "${tool.name}"`);
      lines.push(`    throw new Error("Tool handler not implemented: ${tool.name}");`);
    }
    lines.push(`  },`);

    lines.push(`});`);
  }

  return lines;
}

/**
 * Generate pi.registerCommand() calls for each command in the manifest.
 *
 * @param commands - Array of plugin commands.
 * @returns Lines of TypeScript source.
 */
function generateCommandRegistrations(commands: PluginCommand[], pluginRoot?: string): string[] {
  const lines: string[] = [];

  for (const cmd of commands) {
    lines.push(``);
    lines.push(`// Command: /${cmd.name}`);
    lines.push(`pi.registerCommand(${tsStringLiteral(cmd.name)}, {`);
    if (cmd.description) {
      lines.push(`  description: ${tsStringLiteral(cmd.description)},`);
    }
    if (cmd.args && cmd.args.length > 0) {
      const argsSchema = cmd.args.map((a) => ({
        name: a.name,
        type: a.type ?? "string",
        description: a.description,
        required: a.required ?? false,
      }));
      const argsJson = JSON.stringify(argsSchema, null, 2)
        .split("\n")
        .map((l, i) => (i === 0 ? l : `    ${l}`))
        .join("\n");
      lines.push(`  args: ${argsJson},`);
    }
    lines.push(`  run: async (ctx, args) => {`);
    if (cmd.handler?.source) {
      lines.push(`    const mod = await import(${tsStringLiteral(resolveHandlerSource(cmd.handler.source, pluginRoot))});`);
      lines.push(`    return mod[${tsStringLiteral(cmd.handler.target ?? "default")}](ctx, args);`);
    } else if (cmd.handler?.target) {
      lines.push(`    return ${safeIdent(cmd.handler.target)}(ctx, args);`);
    } else {
      lines.push(`    // TODO: Implement command handler for "/${cmd.name}"`);
      lines.push(`    ctx.ui?.toast?.(\`/${cmd.name} executed\`);`);
    }
    lines.push(`  },`);
    lines.push(`});`);
  }

  return lines;
}

/**
 * Generate pi.registerShortcut() calls for each shortcut in the manifest.
 *
 * @param shortcuts - Array of plugin shortcuts.
 * @returns Lines of TypeScript source.
 */
function generateShortcutRegistrations(
  shortcuts: NonNullable<PluginManifest["shortcuts"]>,
  pluginRoot?: string
): string[] {
  const lines: string[] = [];

  for (const sc of shortcuts) {
    lines.push(``);
    lines.push(`// Shortcut: ${sc.key}`);
    lines.push(`pi.registerShortcut(${tsStringLiteral(sc.key)}, {`);
    if (sc.description) {
      lines.push(`  description: ${tsStringLiteral(sc.description)},`);
    }
    if (sc.when) {
      lines.push(`  when: ${tsStringLiteral(sc.when)},`);
    }
    lines.push(`  action: async (ctx) => {`);
    if (sc.action) {
      if (typeof sc.action === "string") {
        // Named action reference.
        lines.push(`    return ${safeIdent(sc.action)}(ctx);`);
      } else if (sc.action.source) {
        lines.push(`    const mod = await import(${tsStringLiteral(resolveHandlerSource(sc.action.source, pluginRoot))});`);
        lines.push(`    return mod[${tsStringLiteral(sc.action.target ?? "default")}](ctx);`);
      } else if (sc.action.target) {
        lines.push(`    return ${safeIdent(sc.action.target)}(ctx);`);
      }
    } else {
      lines.push(`    // TODO: Implement shortcut action for "${sc.key}"`);
      lines.push(`    ctx.logger?.info?.("Shortcut triggered: ${sc.key}");`);
    }
    lines.push(`  },`);
    lines.push(`});`);
  }

  return lines;
}

/**
 * Generate pi.registerFlag() calls for each flag in the manifest.
 *
 * @param flags - Array of plugin flags.
 * @returns Lines of TypeScript source.
 */
function generateFlagRegistrations(
  flags: NonNullable<PluginManifest["flags"]>,
  pluginRoot?: string
): string[] {
  const lines: string[] = [];

  for (const flag of flags) {
    lines.push(``);
    lines.push(`// Flag: --${flag.name}`);
    lines.push(`pi.registerFlag(${tsStringLiteral(flag.name)}, {`);
    if (flag.description) {
      lines.push(`  description: ${tsStringLiteral(flag.description)},`);
    }
    if (flag.alias) {
      lines.push(`  alias: ${tsStringLiteral(flag.alias)},`);
    }
    if (flag.type) {
      lines.push(`  type: ${tsStringLiteral(flag.type)},`);
    }
    if (flag.defaultValue !== undefined) {
      lines.push(`  default: ${JSON.stringify(flag.defaultValue)},`);
    }
    lines.push(`  handler: async (ctx, value) => {`);
    if (flag.handler?.source) {
      lines.push(`    const mod = await import(${tsStringLiteral(resolveHandlerSource(flag.handler.source, pluginRoot))});`);
      lines.push(`    return mod[${tsStringLiteral(flag.handler.target ?? "default")}](ctx, value);`);
    } else if (flag.handler?.target) {
      lines.push(`    return ${safeIdent(flag.handler.target)}(ctx, value);`);
    } else {
      lines.push(`    // TODO: Implement flag handler for "--${flag.name}"`);
      lines.push(`    ctx.logger?.info?.(\`Flag --${flag.name}=\${value} processed\`);`);
    }
    lines.push(`  },`);
    lines.push(`});`);
  }

  return lines;
}

/* ────────────────────────────────────────────────────────────────────────────
   Main compiler
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Compile a plugin manifest into Pi extension source files.
 *
 * The output contains:
 *   1. `index.ts` — the main extension file exporting a default factory function.
 *   2. `package.json` — only for multi-file extensions; contains a "pi" key with
 *      Pi-specific metadata (name, version, entry point, etc.).
 *
 * Single-file extensions (no external source files referenced) do not need a
 * package.json — Pi's auto-discovery will find `index.ts` directly.
 *
 * @param plugin - The plugin manifest to compile.
 * @returns AdapterOutput with generated files and metadata.
 */
function compilePlugin(plugin: PluginManifest, options?: CompileOptions): AdapterOutput {
  const pluginRoot = options?.pluginRoot;
  // ── Native-entry passthrough: skip codegen entirely ──
  if (plugin.nativeEntry?.pimono) {
    return {
      files: [],
      manifest: plugin,
      warnings: [],
      issues: [],
      nativeCopies: [{ from: plugin.nativeEntry.pimono, to: 'index.ts' }],
    };
  }

  const files: FileOutput[] = [];

  // ── Determine if this is a multi-file extension ──
  let isMultiFile = false;

  // If any handler references an external source file, we treat it as multi-file.
  if (plugin.hooks) {
    for (const hookDef of Object.values(plugin.hooks)) {
      const h = (hookDef as { handler?: unknown }).handler as { type?: string; source?: string } | undefined;
      if (!h) continue;
      if ((h.type === "reference" || h.type === "inline") && h.source) {
        isMultiFile = true;
        break;
      }
    }
  }

  if (plugin.tools) {
    for (const tool of plugin.tools) {
      if (tool.handler?.source) {
        isMultiFile = true;
        break;
      }
    }
  }

  if (plugin.commands) {
    for (const cmd of plugin.commands) {
      if (cmd.handler?.source) {
        isMultiFile = true;
        break;
      }
    }
  }

  if (plugin.shortcuts) {
    for (const sc of plugin.shortcuts) {
      if (typeof sc.action !== "string" && sc.action?.source) {
        isMultiFile = true;
        break;
      }
    }
  }

  if (plugin.flags) {
    for (const flag of plugin.flags) {
      if (flag.handler?.source) {
        isMultiFile = true;
        break;
      }
    }
  }

  // ── Build index.ts ──
  const tsLines: string[] = [];

  // Header / generated notice
  tsLines.push(`/**`);
  tsLines.push(` * Generated Pi Extension — ${plugin.name}`);
  tsLines.push(` *`);
  tsLines.push(` * Platform:    ${DISPLAY_NAME}`);
  tsLines.push(` * Plugin:      ${plugin.name}${plugin.version ? ` v${plugin.version}` : ""}`);
  tsLines.push(` * Generated:   ${new Date().toISOString()}`);
  tsLines.push(` *`);
  tsLines.push(` * This file is auto-generated by @agentplugins/adapter-pimono.`);
  tsLines.push(` * Do not edit manually — changes will be overwritten on next compile.`);
  tsLines.push(` */`);
  tsLines.push(``);

  // Import ExtensionAPI type.
  tsLines.push(`import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";`);

  const overridePath = plugin.adapterOverrides?.pimono;

  // If multi-file with source references, collect dynamic import paths.
  const dynamicImports = new Set<string>();
  if (plugin.hooks) {
    for (const hookDef of Object.values(plugin.hooks)) {
      const h = (hookDef as { handler?: unknown }).handler as { type?: string; source?: string } | undefined;
      if (h?.source) dynamicImports.add(h.source);
    }
  }
  if (plugin.tools) {
    for (const tool of plugin.tools) {
      if (tool.handler?.source) dynamicImports.add(tool.handler.source);
    }
  }
  if (plugin.commands) {
    for (const cmd of plugin.commands) {
      if (cmd.handler?.source) dynamicImports.add(cmd.handler.source);
    }
  }
  if (plugin.shortcuts) {
    for (const sc of plugin.shortcuts) {
      if (typeof sc.action !== "string" && sc.action?.source) {
        dynamicImports.add(sc.action.source);
      }
    }
  }
  if (plugin.flags) {
    for (const flag of plugin.flags) {
      if (flag.handler?.source) dynamicImports.add(flag.handler.source);
    }
  }
  if (overridePath) {
    dynamicImports.add(overridePath);
  }

  if (dynamicImports.size > 0) {
    tsLines.push(``);
    tsLines.push(`// External handler modules (loaded dynamically via jiti)`);
  }

  tsLines.push(``);

  // Default factory function (async when adapterOverrides is set).
  tsLines.push(`/**`);
  tsLines.push(` * Pi extension factory.`);
  tsLines.push(` *`);
  tsLines.push(` * @param pi - The ExtensionAPI instance provided by the Pi runtime.`);
  tsLines.push(` */`);
  tsLines.push(`export default async function(pi: ExtensionAPI) {`);
  if (dynamicImports.size > 0) {
    tsLines.push(`  console.warn('[agentplugins] Plugin loads external handler modules — only install plugins you trust');`);
  }
  if (overridePath) {
    const safeOverride = resolveHandlerSource(overridePath, pluginRoot);
    tsLines.push(`  // Runtime adapter override — tries user file first, falls back to codegen.`);
    if (pluginRoot) {
      tsLines.push(`  console.warn('[agentplugins] Loading adapter override from ' + ${JSON.stringify(safeOverride)} + ' — only install overrides from plugins you trust');`);
    }
    tsLines.push(`  try {`);
    tsLines.push(`    const overrideMod = await import(${tsStringLiteral(safeOverride)});`);
    tsLines.push(`    if (typeof overrideMod.default === 'function') {`);
    tsLines.push(`      return overrideMod.default(pi);`);
    tsLines.push(`    }`);
    tsLines.push(`  } catch {`);
    tsLines.push(`    pi.logger?.warn?.("[${plugin.name}] adapterOverrides.pimono not found — using generated implementation");`);
    tsLines.push(`  }`);
    tsLines.push(``);
  }
  tsLines.push(`  // Extension entry point — register all hooks, tools, commands, etc.`);
  tsLines.push(`  pi.logger?.info?.("[${plugin.name}] Extension loaded on ${DISPLAY_NAME}");`);
  tsLines.push(``);

  // Emit __piPluginRoot helper when any hook uses a command handler.
  const hasCommandHandlers = plugin.hooks
    ? Object.values(plugin.hooks).some((h) => (h as { handler?: { type?: string } }).handler?.type === 'command')
    : false;
  if (hasCommandHandlers) {
    tsLines.push(`  // Directory of this extension file — used to resolve CLAUDE_PLUGIN_ROOT for command handlers.`);
    tsLines.push(`  const __piPluginRoot = new URL('.', import.meta.url).pathname.replace(/\\/$/, '');`);
    tsLines.push(``);
  }

  // ── Hooks ──
  if (plugin.hooks && Object.keys(plugin.hooks).length > 0) {
    tsLines.push(`  /* ── Lifecycle Hooks ── */`);
    // ponytail: per-session cap to prevent runaway continueWith loops; expose via manifest field if tunability needed
    tsLines.push(`  let __continueWithCount = 0;`);
    tsLines.push(`  const __MAX_CONTINUE_WITH = 20;`);
    for (const [hookName, hookDef] of Object.entries(plugin.hooks)) {
      const event = HOOK_TO_EVENT[hookName as UniversalHookName];
      if (!event) {
        tsLines.push(`  // WARNING: No Pi event for hook "${hookName}" — skipping`);
        tsLines.push(``);
        continue;
      }
      const hookHandler = (hookDef as { handler: HookHandler | HandlerReference }).handler;
      const regLines = generateEventRegistration(event, hookHandler, pluginRoot);
      for (const line of regLines) {
        tsLines.push(`  ${line}`);
      }
      tsLines.push(``);
    }
  }

  // ── Tools ──
  if (plugin.tools && plugin.tools.length > 0) {
    tsLines.push(`  /* ── Tools ── */`);
    for (const line of generateToolRegistrations(plugin.tools, pluginRoot)) {
      tsLines.push(`  ${line}`);
    }
    tsLines.push(``);
  }

  // ── Commands ──
  if (plugin.commands && plugin.commands.length > 0) {
    tsLines.push(`  /* ── Commands ── */`);
    for (const line of generateCommandRegistrations(plugin.commands, pluginRoot)) {
      tsLines.push(`  ${line}`);
    }
    tsLines.push(``);
  }

  // ── Shortcuts ──
  if (plugin.shortcuts && plugin.shortcuts.length > 0) {
    tsLines.push(`  /* ── Keyboard Shortcuts ── */`);
    for (const line of generateShortcutRegistrations(plugin.shortcuts, pluginRoot)) {
      tsLines.push(`  ${line}`);
    }
    tsLines.push(``);
  }

  // ── Flags ──
  if (plugin.flags && plugin.flags.length > 0) {
    tsLines.push(`  /* ── CLI Flags ── */`);
    for (const line of generateFlagRegistrations(plugin.flags, pluginRoot)) {
      tsLines.push(`  ${line}`);
    }
    tsLines.push(``);
  }

  // ── Persistent state (appendEntry) ──
  if (plugin.config?.persist) {
    tsLines.push(`  /* ── Persistent State ── */`);
    tsLines.push(`  pi.appendEntry("${plugin.name}", {`);
    tsLines.push(`    loadedAt: new Date().toISOString(),`);
    tsLines.push(`    version: ${tsStringLiteral(plugin.version ?? "0.0.0")},`);
    tsLines.push(`  });`);
    tsLines.push(``);
  }

  tsLines.push(`}`);
  tsLines.push(``);

  files.push({ path: "index.ts", content: tsLines.join("\n") });

  // ── Build package.json (for multi-file extensions) ──
  if (isMultiFile) {
    const pkg: Record<string, unknown> = {
      name: plugin.name,
      version: plugin.version ?? "0.0.0",
      description: plugin.description ?? `Pi extension for ${plugin.name}`,
      main: "index.ts",
      pi: {
        name: plugin.name,
        version: plugin.version ?? "0.0.0",
        displayName: plugin.displayName ?? plugin.name,
        description: plugin.description,
        entry: "index.ts",
        author: plugin.author,
        license: plugin.license,
        hooks: Object.keys(plugin.hooks ?? {}).map((h) => ({
          universal: h,
          piEvent: HOOK_TO_EVENT[h as UniversalHookName] ?? null,
        })),
        tools: (plugin.tools ?? []).map((t) => t.name),
        commands: (plugin.commands ?? []).map((c) => c.name),
        shortcuts: (plugin.shortcuts ?? []).map((s) => s.key),
        flags: (plugin.flags ?? []).map((f) => f.name),
        trusted: plugin.config?.trusted ?? true,
        autoLoad: plugin.config?.autoLoad ?? false,
      },
    };

    files.push({ path: "package.json", content: JSON.stringify(pkg, null, 2) + "\n" });
  }

  // ── Warnings ──
  const warnings: string[] = [];

  // Emit warnings for unsupported hooks.
  if (plugin.hooks) {
    for (const hookName of Object.keys(plugin.hooks)) {
      if (!SUPPORTED_HOOKS.includes(hookName as UniversalHookName)) {
        warnings.push(
          `Hook "${hookName}" is not supported by the Pi adapter and was skipped.`
        );
      }
    }
  }

  // ── NativeCopies for command handlers ──
  // Any hook that uses a command handler may reference files via ${CLAUDE_PLUGIN_ROOT}/path.
  // Extract those paths so the CLI copies them into dist/pimono/ alongside the extension.
  const nativeCopies: { from: string; to: string }[] = [];
  if (plugin.hooks) {
    for (const hookDef of Object.values(plugin.hooks)) {
      const h = (hookDef as { handler?: unknown }).handler as CommandHookHandler | undefined;
      if (!h || h.type !== 'command') continue;
      const pluginRootRefs = h.command.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s"'`]+)/g);
      for (const match of pluginRootRefs) {
        const relPath = match[1];
        nativeCopies.push({ from: relPath, to: relPath });
      }
    }
  }

  return {
    files,
    manifest: plugin,
    warnings,
    issues: [],
    ...(nativeCopies.length > 0 ? { nativeCopies } : {}),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   PiMonoAdapter — the public adapter class
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Pi platform adapter.
 *
 * Implements the AgentPlugins `PlatformAdapter` interface to compile universal
 * plugin manifests into Pi native TypeScript extensions.
 *
 * Usage:
 * ```ts
 * import { piMonoAdapter } from "@agentplugins/adapter-pimono";
 * import { createBridge } from "@agentplugins/core";
 *
 * const bridge = createBridge({ adapter: piMonoAdapter });
 * const output = bridge.compile(myPluginManifest);
 * // output.files["index.ts"]  → the generated extension
 * // output.files["package.json"] → metadata (multi-file only)
 * ```
 */
export class PiMonoAdapter implements PlatformAdapter {
  /** @inheritdoc */
  readonly name: TargetPlatform = PLATFORM_NAME;

  /** @inheritdoc */
  readonly displayName: string = DISPLAY_NAME;

  /** @inheritdoc */
  readonly supportedHooks: readonly UniversalHookName[] = SUPPORTED_HOOKS;

  /** @inheritdoc */
  readonly supportedHandlers: readonly HandlerType[] = SUPPORTED_HANDLERS;

  /** @inheritdoc */
  readonly manifestPath: string = MANIFEST_PATH;

  /** @inheritdoc */
  readonly manifestFormat: "json" | "toml" = MANIFEST_FORMAT;

  /**
 * Validate a plugin manifest for Pi compatibility.
   *
   * @param plugin - The plugin manifest.
   * @returns Array of validation issues (empty if valid).
   */
  validate(plugin: PluginManifest): ValidationIssue[] {
    return validatePlugin(plugin);
  }

  /**
   * Compile a plugin manifest into Pi extension files.
   *
   * @param plugin - The plugin manifest.
   * @param options - Optional compile options including pluginRoot for safe path resolution.
   * @returns AdapterOutput containing generated files and metadata.
   */
  compile(plugin: PluginManifest, options?: CompileOptions): AdapterOutput {
    // Run validation first and surface errors.
    const issues = this.validate(plugin);
    const errors = issues.filter((i) => i.severity === "error");

    if (errors.length > 0) {
      const errorMessages = errors.map((e) => `  - ${e.message}`).join("\n");
      throw new Error(
        `Pi adapter validation failed with ${errors.length} error(s):\n${errorMessages}`
      );
    }

    return compilePlugin(plugin, options);
  }
}

/**
 * Singleton instance of the Pi adapter.
 *
 * Most consumers should use this pre-constructed instance rather than
 * constructing `PiMonoAdapter` directly.
 */
export const piMonoAdapter = new PiMonoAdapter();

/** Factory function for creating a new Pi adapter instance. */
export function createPiMonoAdapter(): PlatformAdapter {
  return new PiMonoAdapter();
}

/* ────────────────────────────────────────────────────────────────────────────
   Re-exports from @agentplugins/core for consumer convenience
   ──────────────────────────────────────────────────────────────────────────── */

export type {
  PluginManifest,
  ValidationIssue,
  AdapterOutput,
  ToolDefinition,
  InlineHookHandler,
} from "@agentplugins/core";

export { HOOK_TO_EVENT, SUPPORTED_HOOKS, SUPPORTED_HANDLERS };
