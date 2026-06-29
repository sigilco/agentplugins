/**
 * AgentPlugins — OpenCode Adapter handler invocation codegen
 *
 * Generates TypeScript code that invokes a handler inside an OpenCode hook.
 * Routes through @agentplugins/compile's emitCommandAsExecSync() to prevent
 * template-literal injection and shell:true in command handlers.
 */

import type {
  HookHandler,
  InlineHookHandler,
  HttpHookHandler,
  CommandHookHandler,
} from "@agentplugins/core";
import type { UniversalHookName } from "@agentplugins/core/adapter";
import { emitCommandAsExecSync } from "@agentplugins/compile";

const INDENT = "        ";

/**
 * Generates TypeScript code that invokes a handler within an OpenCode hook.
 *
 * @param handler - The handler to invoke (inline, command, or http)
 * @param hookName - The universal hook name (for comments)
 * @param contextVar - The context variable name to pass (e.g., "args", "event")
 */
export function buildHandlerInvocation(
  handler: HookHandler,
  hookName: UniversalHookName,
  contextVar: string = 'ctx'
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
      const execLine = emitCommandAsExecSync(ch, {
        pluginRootVar: "__pluginRoot",
        indent: `${INDENT}  `,
      });
      return [
        `${INDENT}// [${hookName}] command handler`,
        `${INDENT}const { execSync: __execSync } = await import('node:child_process');`,
        execLine,
      ].join("\n");
    }

    case "http": {
      const hh = handler as HttpHookHandler;
      const urlLiteral = JSON.stringify(hh.url);
      const headersLiteral = JSON.stringify(hh.headers ?? {});
      return [
        `${INDENT}// [${hookName}] HTTP handler`,
        `${INDENT}try {`,
        `${INDENT}  const response = await fetch(${urlLiteral}, {`,
        `${INDENT}    method: "POST",`,
        `${INDENT}    headers: ${headersLiteral},`,
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
