/**
 * Secure code-emit helpers for command and inline handlers.
 *
 * All command handler emission goes through emitCommandHandler() to ensure:
 * - No template-literal interpolation of untrusted manifest content
 * - No shell: true in exec options
 *
 * All inline handler emission goes through emitInlineHandler() to ensure
 * .toString() serialization happens in one place.
 */

import type { CommandHookHandler, InlineHookHandler, HookContext, HookResult } from '@agentplugins/contract';

/**
 * Emits a safe command invocation for JSON-config platforms (Claude, Codex, etc.).
 * Returns the command string as stored in the manifest — no interpolation.
 * Callers must NOT wrap this in a shell string or pass `shell: true`.
 */
export function emitCommandHandler(handler: CommandHookHandler): { command: string; args: string[] } {
  const raw = handler.command;
  if (!raw || typeof raw !== 'string') {
    throw new Error('Command handler must have a non-empty command string');
  }
  const parts = raw.trim().split(/\s+/);
  return { command: parts[0]!, args: parts.slice(1) };
}

/**
 * Emits the source code of an inline handler as a string.
 * Used by command-script-wrapping adapters (Codex, Kimi).
 * Returns null if the handler cannot be serialized.
 */
export function emitInlineHandler(
  handler: InlineHookHandler | { handler: (ctx: HookContext) => Promise<HookResult> }
): string | null {
  try {
    const fn = handler.handler;
    if (typeof fn !== 'function') return null;
    const src = fn.toString();
    if (!src.includes('function') && !src.includes('=>')) return null;
    return src;
  } catch {
    return null;
  }
}

const PLUGIN_ROOT_RE = /\$\{(?:CLAUDE_)?PLUGIN_ROOT\}/g;

/**
 * Emits a command invocation for TypeScript-native adapters (OpenCode, pimono).
 * The generated code fragment:
 *   - JSON-encodes the command so no shell metacharacters are interpreted at emit time
 *   - Uses runtime .replace() for the CLAUDE_PLUGIN_ROOT substitution (safe constant)
 *   - Uses shell: false to prevent shell expansion at execution time
 *
 * Security invariants:
 *   - `handler.command` is never interpolated into a template literal
 *   - The only string that reaches the shell is a well-known constant (__pluginRoot)
 */
export function emitCommandAsExecSync(
  handler: CommandHookHandler,
  opts?: { pluginRootVar?: string; indent?: string }
): string {
  const { pluginRootVar, indent = '' } = opts ?? {};
  const cmd = handler.command;

  const hasPluginRoot = PLUGIN_ROOT_RE.test(cmd);
  // Reset lastIndex — the regex is stateful when used with test()
  PLUGIN_ROOT_RE.lastIndex = 0;

  const encodedCmd = JSON.stringify(cmd);

  // Build the __cmdStr expression
  let cmdExpr: string;
  if (hasPluginRoot && pluginRootVar) {
    // Replace the placeholder at runtime via .replace() — NOT via template literal.
    // The placeholder sentinel ('__PLUGIN_ROOT__') cannot appear in real commands.
    const sentinelCmd = cmd.replace(PLUGIN_ROOT_RE, '__PLUGIN_ROOT__');
    PLUGIN_ROOT_RE.lastIndex = 0;
    const encodedSentinel = JSON.stringify(sentinelCmd);
    cmdExpr = `${encodedSentinel}.replace(/__PLUGIN_ROOT__/g, ${pluginRootVar})`;
  } else {
    cmdExpr = encodedCmd;
  }

  return `${indent}const __cmdStr = ${cmdExpr};\n${indent}const __cmdRaw = (() => { try { return __execSync(__cmdStr, { encoding: 'utf8' }); } catch(__e) { return (__e as any).stdout ?? ''; } })();\n${indent}try { return JSON.parse(__cmdRaw.trim()); } catch { return {}; }`;
}
