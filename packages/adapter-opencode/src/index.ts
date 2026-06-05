/**
 * AgentBridge — OpenCode Platform Adapter
 *
 * This adapter converts universal AgentBridge plugin manifests into
 * OpenCode-compatible plugins. OpenCode uses a function-export model
 * where the default export receives a PluginInput context and returns
 * a Hooks object mapping hook names to handlers.
 *
 * Target platform characteristics:
 *   - Runtime: Bun
 *   - Manifest: package.json + opencode.json
 *   - Plugins: JS/TS modules exporting a default function
 *   - Handler types: INLINE only (command/http wrapped via Bun.$)
 *   - Discovery: .opencode/plugins/ or ~/.config/opencode/plugins/
 *   - Tool definitions: Zod schemas via tool() helper
 *
 * @module @agentbridge/adapter-opencode
 */

import {
  type PlatformAdapter,
  type PluginManifest,
  type ValidationIssue,
  type AdapterOutput,
  type UniversalHookName,
  type HandlerType,
  type TargetPlatform,
  type HookDefinition,
  type HookHandler,
  type InlineHookHandler,
  type CommandHookHandler,
  type HttpHookHandler,
  Severity,
} from "@agentbridge/core";

// ─── Hook Mapping ─────────────────────────────────────────────────────────────

/** Maps universal hook names to their OpenCode equivalents. */
const HOOK_MAPPING: Partial<Record<UniversalHookName, string>> = {
  sessionStart: "event",
  sessionEnd: "event",
  preToolUse: "tool.execute.before",
  postToolUse: "tool.execute.after",
  permissionRequest: "permission.ask",
  notification: "event",
  preCompact: "experimental.session.compacting",
  stop: "event",
};

/** Reverse lookup for event-type hooks that need conditional branching. */
const EVENT_TYPE_CONDITIONS: Record<string, string> = {
  sessionStart: 'event.type === "session.created"',
  sessionEnd: 'event.type === "session.deleted"',
  stop: 'event.type === "session.idle"',
};

/** Hooks that are implemented via the generic "event" handler with a type check. */
const EVENT_HOOKS: readonly UniversalHookName[] = [
  "sessionStart",
  "sessionEnd",
  "notification",
  "stop",
];

// ─── Adapter Implementation ───────────────────────────────────────────────────

/**
 * OpenCode platform adapter for AgentBridge.
 *
 * Converts universal plugin manifests into OpenCode-compatible plugin files
 * that can be dropped into `.opencode/plugins/` or `~/.config/opencode/plugins/`.
 */
export class OpenCodeAdapter implements PlatformAdapter {
  /** Platform identifier used by AgentBridge core. */
  readonly name: TargetPlatform = "opencode";

  /** Human-readable platform name. */
  readonly displayName = "OpenCode";

  /**
   * Universal hooks supported by this adapter.
   *
   * These map to OpenCode's native hook system (event, tool.execute.before,
   * tool.execute.after, permission.ask, experimental.session.compacting, …).
   */
  readonly supportedHooks: readonly UniversalHookName[] = [
    "sessionStart",
    "sessionEnd",
    "preToolUse",
    "postToolUse",
    "permissionRequest",
    "notification",
    "preCompact",
    "stop",
  ];

  /**
   * Handler types natively supported by OpenCode.
   *
   * OpenCode plugins are TypeScript functions, so "inline" is the native
   * handler type. "command" and "http" handlers are automatically wrapped
   * using Bun's shell API (`$`) so that they appear as inline functions to
   * the OpenCode runtime.
   */
  readonly supportedHandlers: readonly HandlerType[] = ["inline"];

  /** Relative path where OpenCode expects plugin manifests. */
  readonly manifestPath = ".opencode/plugins/";

  /** OpenCode uses JSON configuration (opencode.json). */
  readonly manifestFormat = "json" as const;

  // ─── Validation ──────────────────────────────────────────────────────────

  /**
   * Validates a universal plugin manifest for the OpenCode platform.
   *
   * Checks performed:
   *   1. Every declared hook is supported by OpenCode.
   *   2. Every handler can be adapted (inline is native; command/http are
   *      wrapped but generate an informational note).
   *   3. The plugin name is present and valid for a directory name.
   *   4. No duplicate hook registrations.
   *
   * @param plugin - The universal plugin manifest to validate.
   * @returns An array of validation issues (errors, warnings, or notes).
   */
  validate(plugin: PluginManifest): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // ── Hook compatibility ──
    const seenHooks = new Set<UniversalHookName>();
    const hooks = plugin.hooks ?? {};
    for (const [hookName, hookDef] of Object.entries(hooks)) {
      const universalHook = hookName as UniversalHookName;
      if (!this.supportedHooks.includes(universalHook)) {
        issues.push({
          severity: Severity.ERROR,
          field: "hooks",
          message: `Hook "${hookName}" is not supported by OpenCode. Supported hooks: ${this.supportedHooks.join(", ")}.`,
        });
      }
      if (seenHooks.has(universalHook)) {
        issues.push({
          severity: Severity.ERROR,
          field: "hooks",
          message: `Duplicate registration for hook "${hookName}". OpenCode does not allow multiple handlers per hook.`,
        });
      }
      seenHooks.add(universalHook);

      // ── Handler compatibility ──
      const handler = hookDef?.handler;
      if (handler?.type === "command") {
        issues.push({
          severity: Severity.INFO,
          field: `hooks.${hookName}`,
          message: `Command handler will be wrapped using Bun.$() for OpenCode compatibility.`,
        });
      } else if (handler?.type === "http") {
        issues.push({
          severity: Severity.INFO,
          field: `hooks.${hookName}`,
          message: `HTTP handler will be wrapped using Bun.$() (curl) for OpenCode compatibility.`,
        });
      }
    }

    // ── Plugin metadata ──
    if (!plugin.name || plugin.name.trim().length === 0) {
      issues.push({
        severity: Severity.ERROR,
        field: "name",
        message: "Plugin name is required and must be a non-empty string.",
      });
    } else if (!/^[a-z0-9._-]+$/i.test(plugin.name)) {
      issues.push({
        severity: Severity.WARNING,
        field: "name",
        message: `Plugin name "${plugin.name}" contains characters that may not be safe for filesystem paths.`,
      });
    }

    // ── Tool compatibility ──
    // Tools are passed through as-is to OpenCode

    return issues;
  }

  // ─── Compilation ─────────────────────────────────────────────────────────

  /**
   * Compiles a universal plugin manifest into OpenCode-compatible output.
   *
   * The returned {@link AdapterOutput} contains:
   *   - `files`: The generated plugin TypeScript file and opencode.json config.
   *   - `installCommand`: Instructions for installing the plugin.
   *
   * The generated plugin:
   *   - Exports a default async function receiving `(ctx)`.
   *   - Returns a Hooks object where keys are OpenCode hook names.
   *   - Maps universal hooks to OpenCode hooks via the HOOK_MAPPING table.
   *   - For "event" hooks, inserts conditional checks on `event.type`.
   *   - For inline handlers, calls the function directly.
   *   - For command/http handlers, spawns them via `Bun.$()`.
   *
   * @param plugin - The universal plugin manifest to compile.
   * @returns The adapter output with generated files and install instructions.
   */
  compile(plugin: PluginManifest): AdapterOutput {
    const pluginFileName = `${plugin.name}.ts`;
    const configFileName = "opencode.json";

    // Group hook definitions by their OpenCode hook name.
    // Event hooks (sessionStart, sessionEnd, notification, stop) share the
    // same "event" key and are merged with if/else branches.
    interface HookReg {
      hook: UniversalHookName;
      def: HookDefinition;
    }
    const grouped = new Map<string, HookReg[]>();
    const hooks = plugin.hooks ?? {};
    for (const [hookName, hookDef] of Object.entries(hooks)) {
      const universalHook = hookName as UniversalHookName;
      const ocHook = HOOK_MAPPING[universalHook];
      if (!ocHook || !hookDef) continue; // skip unsupported — validation already caught this
      const arr = grouped.get(ocHook) ?? [];
      arr.push({ hook: universalHook, def: hookDef });
      grouped.set(ocHook, arr);
    }

    // Build the hooks object body.
    const hookEntries: string[] = [];

    for (const [ocHook, registrations] of grouped) {
      if (ocHook === "event") {
        hookEntries.push(this.buildEventHookBlock(registrations));
      } else {
        // Direct mapping hooks (tool.execute.before, tool.execute.after, …).
        const reg = registrations[0]; // only one registration per direct hook
        const handlerBody = this.buildHandlerInvocation(reg.def.handler, reg.hook);
        const args = this.buildHookArgs(ocHook, reg.hook);
        hookEntries.push(
          `    "${ocHook}": async (${args}) => {\n${handlerBody}\n    }`
        );
      }
    }

    // Build the plugin file content.
    const pluginFileContent = [
      `// Auto-generated by AgentBridge for OpenCode`,
      `// Plugin: ${plugin.name}`,
      `// Description: ${plugin.description ?? "No description provided"}`,
      ``,
      `/**`,
      ` * ${plugin.name} — OpenCode Plugin`,
      ` *`,
      ` * This module was generated by @agentbridge/adapter-opencode.`,
      ` * Drop this file into \`.opencode/plugins/\` or`,
      ` * \`~/.config/opencode/plugins/\` to activate.`,
      ` */`,
      ``,
      `export default async function(ctx) {`,
      `  return {`,
      hookEntries.join(",\n"),
      `  };`,
      `}`,
      ``,
    ].join("\n");

    // Build opencode.json config.
    const opencodeConfig = {
      name: plugin.name,
      description: plugin.description ?? "",
      version: plugin.version ?? "0.1.0",
      author: plugin.author ?? "",
      license: plugin.license ?? "MIT",
      hooks: Object.fromEntries(
        Array.from(grouped.keys()).map((k) => [k, true])
      ),
      tools:
        plugin.tools?.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })) ?? [],
      discovery: {
        paths: [".opencode/plugins/", "~/.config/opencode/plugins/"],
      },
    };
    const configFileContent = JSON.stringify(opencodeConfig, null, 2);

    return {
      files: [
        {
          path: pluginFileName,
          content: pluginFileContent,
        },
        {
          path: configFileName,
          content: configFileContent,
        },
      ],
      manifest: { name: plugin.name, version: plugin.version },
      warnings: [],
      issues: [],
      postInstall: [
        `cp ${pluginFileName} .opencode/plugins/`,
        `mkdir -p .opencode/plugins/${plugin.name}`,
        `cp ${configFileName} .opencode/plugins/${plugin.name}/`,
      ],
    };
  }

  // ─── Code generation helpers ─────────────────────────────────────────────

  /**
   * Builds the "event" hook block that conditionally routes to the correct
   * universal handler based on `event.type`.
   */
  private buildEventHookBlock(registrations: { hook: UniversalHookName; def: HookDefinition }[]): string {
    const branches: string[] = [];

    for (const reg of registrations) {
      const condition = EVENT_TYPE_CONDITIONS[reg.hook];
      if (!condition) {
        branches.push(this.buildHandlerInvocation(reg.def.handler, reg.hook));
        continue;
      }
      const handlerBody = this.buildHandlerInvocation(reg.def.handler, reg.hook);
      branches.push(`      if (${condition}) {\n${handlerBody}\n      }`);
    }

    return [
      `    event: async ({ event }) => {`,
      branches.join("\n"),
      `    }`,
    ].join("\n");
  }

  /**
   * Builds the argument list for a given OpenCode hook function signature.
   *
   * @param ocHook - The OpenCode hook name.
   * @param _universalHook - The universal hook name (for future extensibility).
   * @returns A comma-separated argument string.
   */
  private buildHookArgs(ocHook: string, _universalHook: UniversalHookName): string {
    switch (ocHook) {
      case "tool.execute.before":
      case "tool.execute.after":
        return "input, output";
      case "permission.ask":
        return "request";
      case "experimental.session.compacting":
        return "session";
      default:
        return "ctx";
    }
  }

  /**
   * Generates the TypeScript code that invokes a handler inside an OpenCode
   * hook function.
   */
  private buildHandlerInvocation(handler: HookHandler, hookName: UniversalHookName): string {
    const indent = "        ";

    switch (handler.type) {
      case "inline": {
        const ih = handler as InlineHookHandler;
        return [
          `${indent}// [${hookName}] inline handler`,
          `${indent}const result = await (${ih.handler.toString()})(ctx);`,
          `${indent}return result;`,
        ].join("\n");
      }

      case "command": {
        const ch = handler as CommandHookHandler;
        return [
          `${indent}// [${hookName}] command handler (wrapped via Bun.$)`,
          `${indent}const proc = Bun.$\`${ch.command}\`;`,
          `${indent}const stdout = await proc.text();`,
          `${indent}return stdout;`,
        ].join("\n");
      }

      case "http": {
        const hh = handler as HttpHookHandler;
        return [
          `${indent}// [${hookName}] HTTP handler (wrapped via fetch)`,
          `${indent}const response = await fetch("${hh.url}", {`,
          `${indent}  method: "POST",`,
          `${indent}  headers: ${JSON.stringify(hh.headers ?? {})},`,
          `${indent}  body: JSON.stringify(ctx),`,
          `${indent}});`,
          `${indent}return response.json();`,
        ].join("\n");
      }

      default: {
        return `${indent}throw new Error("Unsupported handler type: ${(handler as any).type}");`;
      }
    }
  }
}

// ─── Factory Export ───────────────────────────────────────────────────────────

/**
 * Creates a new instance of the OpenCode adapter.
 *
 * @example
 * ```ts
 * import { createOpenCodeAdapter } from "@agentbridge/adapter-opencode";
 * import { compilePlugin } from "@agentbridge/core";
 *
 * const adapter = createOpenCodeAdapter();
 * const output = compilePlugin(manifest, adapter);
 * ```
 */
export function createOpenCodeAdapter(): OpenCodeAdapter {
  return new OpenCodeAdapter();
}

/** Default adapter instance for convenience. */
export default new OpenCodeAdapter();
