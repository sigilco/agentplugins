/**
 * AgentBridge — OpenCode Adapter Factory
 *
 * Factory function for creating OpenCode adapter instances.
 * This module provides the createOpenCodeAdapter() factory and the
 * default adapter instance.
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
} from "@agentbridge/core";

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
 * OpenCode platform adapter for AgentBridge.
 *
 * Converts universal plugin manifests into OpenCode-compatible plugin files
 * that can be dropped into `.opencode/plugins/` or `~/.config/opencode/plugins/`.
 */
class OpenCodeAdapter implements PlatformAdapter {
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
   *
   * @param _plugin - The universal plugin manifest to validate.
   * @returns An empty array (stub - will be wired in Task 11).
   */
  validate(_plugin: PluginManifest): ValidationIssue[] {
    // Stub implementation - will be wired from src/validate.ts in Task 11
    return [];
  }

  /**
   * Compiles the universal plugin into platform-specific output.
   *
   * @param plugin - The universal plugin manifest to compile.
   * @returns AdapterOutput with basic structure (stub - will be wired in Task 11).
   */
  compile(plugin: PluginManifest): AdapterOutput {
    // Stub implementation - will be wired from compile logic in Task 11
    const pluginFileName = `${plugin.name}.ts`;
    const configFileName = "opencode.json";

    return {
      files: [
        {
          path: pluginFileName,
          content: `// Stub plugin file for ${plugin.name}`,
        },
        {
          path: configFileName,
          content: JSON.stringify({ name: plugin.name, version: plugin.version }, null, 2),
        },
      ],
      manifest: { name: plugin.name, version: plugin.version },
      warnings: [],
      issues: [],
      postInstall: [
        `cp ${pluginFileName} .opencode/plugins/`,
        `cp ${configFileName} .opencode/plugins/`,
      ],
    };
  }
}

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
export function createOpenCodeAdapter(): PlatformAdapter {
  return new OpenCodeAdapter();
}

/** Default adapter instance for convenience. */
export default createOpenCodeAdapter();
