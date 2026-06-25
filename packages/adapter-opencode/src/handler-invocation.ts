/**
 * AgentPlugins — OpenCode Adapter buildHandlerInvocation()
 *
 * Generates the TypeScript code that invokes a handler inside an OpenCode
 * hook function.
 *
 * This module extracts handler invocation generation from the main adapter
 * to enable TDD and better separation of concerns.
 *
 * Key bug fixed: inline handlers previously used `ctx` directly, which is
 * undefined in event hook scope. The context variable must be passed as a
 * parameter to buildHandlerInvocation.
 */

import type {
  HookHandler,
  InlineHookHandler,
  CommandHookHandler,
  HttpHookHandler,
} from "@agentplugins/core";
import type {
  UniversalHookName,
} from "@agentplugins/core/adapter";

/**
 * The standard indentation used for code inside hook functions.
 * OpenCode uses 8 spaces for inner body indentation.
 */
const INDENT = "        ";

/**
 * Builds the TypeScript code that invokes a handler within an OpenCode hook.
 *
 * @param handler - The handler to invoke (inline, command, or http)
 * @param hookName - The universal hook name (for comments)
 * @param contextVar - The context variable name to pass (e.g., "args", "event")
 * @returns TypeScript code string that invokes the handler
 */
export function buildHandlerInvocation(
  handler: HookHandler,
  hookName: UniversalHookName,
  contextVar: string
): string {
  switch (handler.type) {
    case "inline": {
      const ih = handler as InlineHookHandler;
      return [
        `${INDENT}// [${hookName}] inline handler`,
        `${INDENT}try {`,
        `${INDENT}  const result = await (${ih.handler.toString()})(${contextVar});`,
        `${INDENT}  return result;`,
        `${INDENT}} catch (error) {`,
        `${INDENT}  console.error(\`[${hookName}] inline handler error:\`, error);`,
        `${INDENT}  throw error;`,
        `${INDENT}}`,
      ].join("\n");
    }

    case "command": {
      const ch = handler as CommandHookHandler;
      // Replace ${CLAUDE_PLUGIN_ROOT} with __pluginRoot (defined by generatePluginFile when needed)
      const cmdTemplate = ch.command
        .replace(/"(\$\{CLAUDE_PLUGIN_ROOT\}[^"]*?)"/g, (_m, p1: string) =>
          p1.replace("${CLAUDE_PLUGIN_ROOT}", "${__pluginRoot}"))
        .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, "${__pluginRoot}");
      return [
        `${INDENT}// [${hookName}] command handler`,
        `${INDENT}const { execSync: __execSync } = await import('node:child_process');`,
        `${INDENT}const __cmdStr = \`${cmdTemplate}\`;`,
        `${INDENT}let __cmdRaw = '';`,
        `${INDENT}try {`,
        `${INDENT}  __cmdRaw = __execSync(__cmdStr, {`,
        `${INDENT}    encoding: 'utf8',`,
        `${INDENT}    shell: true,`,
        `${INDENT}    env: { ...process.env, CLAUDE_PLUGIN_ROOT: __pluginRoot },`,
        `${INDENT}  });`,
        `${INDENT}} catch (__e) {`,
        `${INDENT}  __cmdRaw = (__e as any).stdout ?? '';`,
        `${INDENT}}`,
        `${INDENT}try { return JSON.parse(__cmdRaw.trim()); } catch { return {}; }`,
      ].join("\n");
    }

    case "http": {
      const hh = handler as HttpHookHandler;
      return [
        `${INDENT}// [${hookName}] HTTP handler (wrapped via fetch)`,
        `${INDENT}try {`,
        `${INDENT}  const response = await fetch("${hh.url}", {`,
        `${INDENT}    method: "POST",`,
        `${INDENT}    headers: ${JSON.stringify(hh.headers ?? {})},`,
        `${INDENT}    body: JSON.stringify(${contextVar}),`,
        `${INDENT}  });`,
        `${INDENT}  return response.json();`,
        `${INDENT}} catch (error) {`,
        `${INDENT}  console.error(\`[${hookName}] HTTP handler error:\`, error);`,
        `${INDENT}  throw error;`,
        `${INDENT}}`,
      ].join("\n");
    }

    default: {
      return `${INDENT}throw new Error("Unsupported handler type: ${(handler as HookHandler).type}");`;
    }
  }
}
