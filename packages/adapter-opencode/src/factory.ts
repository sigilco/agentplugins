/**
 * AgentPlugins — OpenCode Adapter Factory
 *
 * Factory function for creating OpenCode adapter instances.
 * This module provides the createOpenCodeAdapter() factory and the
 * default adapter instance.
 *
 * @module @agentplugins/adapter-opencode
 */

import {
  type PluginManifest,
  type TargetPlatform,
} from "@agentplugins/core";

import {
  type PlatformAdapter,
  type ValidationIssue,
  type AdapterOutput,
  type UniversalHookName,
  type HandlerType,
  type HookDefinition,
} from "@agentplugins/core/adapter";

import { createValidate } from "./validate";
import {
  HOOK_MAPPING,
  EVENT_HOOKS,
  buildEventHookBlock,
  buildHookArgs,
} from "./hook-mapping";
import { buildHandlerInvocation } from "./handler-invocation";
import { generatePluginFile, generateManifest } from "./output-generators";

/**
 * The 8 hooks supported by OpenCode.
 */
const SUPPORTED_HOOKS: readonly UniversalHookName[] = [
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
 * OpenCode platform adapter for AgentPlugins.
 *
 * Converts universal plugin manifests into OpenCode-compatible plugin files
 * that can be dropped into `.opencode/plugins/` or `~/.config/opencode/plugins/`.
 */
class OpenCodeAdapter implements PlatformAdapter {
  /** Platform identifier used by AgentPlugins core. */
  readonly name: TargetPlatform = "opencode";

  /** Human-readable platform name. */
  readonly displayName = "OpenCode";

  /**
   * Universal hooks supported by this adapter.
   *
   * These map to OpenCode's native hook system (event, tool.execute.before,
   * tool.execute.after, permission.ask, experimental.session.compacting, …).
   */
  readonly supportedHooks: readonly UniversalHookName[] = SUPPORTED_HOOKS;

  /**
   * Handler types natively supported by OpenCode.
   *
   * OpenCode plugins are TypeScript functions, so "inline" is the native
   * handler type. "command" and "http" handlers are automatically wrapped
   * using Bun's shell API (`$`) so that they appear as inline functions to
   * the OpenCode runtime.
   */
  readonly supportedHandlers: readonly HandlerType[] = ["inline"];

  /** Path to manifest file (relative to plugin root). */
  readonly manifestPath = "opencode.json";

  /** OpenCode uses JSON configuration (opencode.json). */
  readonly manifestFormat = "json" as const;

  /**
   * Validates a plugin for this platform, returning any issues.
   */
  validate(plugin: PluginManifest): ValidationIssue[] {
    const validateFn = createValidate();
    return validateFn(plugin);
  }

  /**
   * Compiles the universal plugin into platform-specific output.
   */
  compile(plugin: PluginManifest): AdapterOutput {
    // Run validation first
    const validateFn = createValidate();
    const issues = validateFn(plugin);

    // Build hook code map
    const hookCodeMap: Map<string, string> = new Map();

    // Collect event hook registrations separately (they share the 'event' key)
    const eventRegistrations: { hook: UniversalHookName; def: HookDefinition }[] = [];

    const hooks = plugin.hooks ?? {};
    for (const [hookName, hookDef] of Object.entries(hooks)) {
      const universalHook = hookName as UniversalHookName;
      const ocHook = HOOK_MAPPING[universalHook];
      if (!ocHook || !hookDef) continue;

      if (EVENT_HOOKS.includes(universalHook)) {
        // Collect event hooks for buildEventHookBlock
        eventRegistrations.push({ hook: universalHook, def: hookDef });
      } else {
        // Direct mapping hooks (tool.execute.before, tool.execute.after, …)
        const contextVar = buildHookArgs(ocHook, universalHook);
        const handlerCode = buildHandlerInvocation(hookDef.handler, universalHook, contextVar);
        hookCodeMap.set(ocHook, handlerCode);
      }
    }

    // Build event hook block if we have event registrations
    if (eventRegistrations.length > 0) {
      const eventBlock = buildEventHookBlock(eventRegistrations);
      hookCodeMap.set("event", eventBlock);
    }

    // Generate output files
    const files = [
      generatePluginFile(plugin, hookCodeMap),
      generateManifest(plugin, hookCodeMap),
    ];

    return {
      files,
      manifest: { name: plugin.name, version: plugin.version },
      warnings: [],
      issues,
      postInstall: [
        `cp ${plugin.name}.ts .opencode/plugins/`,
        `cp opencode.json .opencode/plugins/`,
      ],
    };
  }
}

/**
 * Creates a new instance of the OpenCode adapter.
 */
export function createOpenCodeAdapter(): PlatformAdapter {
  return new OpenCodeAdapter();
}

/** Default adapter instance for convenience. */
export default createOpenCodeAdapter();
