/**
 * AgentPlugins — OpenCode Adapter validate()
 *
 * Validates a universal plugin manifest for the OpenCode platform.
 *
 * Checks performed:
 *   1. Every declared hook is supported by OpenCode.
 *   2. Every handler can be adapted (inline is native; command/http get INFO notes).
 *   3. The plugin name is present and valid for a directory name.
 *   4. No duplicate hook registrations.
 */

import {
  type PluginManifest,
  type HookHandler,
  type InlineHookHandler,
  type CommandHookHandler,
  type HttpHookHandler,
  Severity,
} from "@agentplugins/core";

import {
  type ValidationIssue,
  type UniversalHookName,
} from "@agentplugins/core/adapter";

/**
 * The 8 hooks supported by OpenCode via universal codegen.
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
 * Hooks that have no native OpenCode event but can be implemented via a
 * guided per-harness escape-hatch. These emit a WARN (not an error) so that
 * portable manifests remain buildable; authors are pointed to the compat matrix.
 *
 * See: docs-site/reference/compat-matrix.md — "subagentStart / subagentStop"
 */
const GUIDED_PERHARNESS_HOOKS: readonly UniversalHookName[] = [
  "subagentStart",
  "subagentStop",
];

/**
 * Creates a validate function for the OpenCode adapter.
 *
 * @example
 * ```ts
 * import { createValidate } from "@agentplugins/adapter-opencode";
 * const validate = createValidate();
 * const issues = validate(manifest);
 * ```
 */
export function createValidate(): (plugin: PluginManifest) => ValidationIssue[] {
  return function validate(plugin: PluginManifest): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // ── Hook compatibility ──────────────────────────────────────────────────

    const seenHooks = new Set<UniversalHookName>();
    const hooks = plugin.hooks ?? {};

    for (const [hookName, hookDef] of Object.entries(hooks)) {
      const universalHook = hookName as UniversalHookName;

      // Check if hook is supported
      if (GUIDED_PERHARNESS_HOOKS.includes(universalHook)) {
        // OpenCode has no native subagent lifecycle events. Authors can implement
        // the same functionality via a per-harness escape-hatch approach.
        issues.push({
          severity: Severity.WARNING,
          field: "hooks",
          message:
            `Hook "${hookName}" has no native OpenCode event. ` +
            `OpenCode does not expose a child-session/subagent lifecycle. ` +
            `Use a per-harness nativeEntry or intercept via preToolUse/postToolUse for the subagent tool. ` +
            `See docs-site/reference/compat-matrix.md for the guided per-harness path. ` +
            `This hook will be omitted from the OpenCode output.`,
        });
      } else if (!SUPPORTED_HOOKS.includes(universalHook)) {
        issues.push({
          severity: Severity.ERROR,
          field: "hooks",
          message: `Hook "${hookName}" is not supported by OpenCode. Supported hooks: ${SUPPORTED_HOOKS.join(", ")}.`,
        });
      }

      // Check for duplicate hook registration
      if (seenHooks.has(universalHook)) {
        issues.push({
          severity: Severity.ERROR,
          field: "hooks",
          message: `Duplicate registration for hook "${hookName}". OpenCode does not allow multiple handlers per hook.`,
        });
      }
      seenHooks.add(universalHook);

      // ── Handler compatibility ─────────────────────────────────────────────
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
      // Inline handlers are native to OpenCode - no issues generated
    }

    // ── Plugin metadata ────────────────────────────────────────────────────

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

    // Note: version is NOT validated here - that's handled by universal validation
    // OpenCode adapter validation only checks platform-specific constraints

    return issues;
  };
}
