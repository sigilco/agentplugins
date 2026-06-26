/**
 * Secure code-emit helpers for command and inline handlers.
 *
 * All command handler emission goes through emitCommandHandler() to ensure:
 * - No template-literal interpolation of untrusted values into shell strings
 * - No shell: true in exec options (use execFileSync with arg array instead)
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
  // Split into argv[] — avoids shell interpretation entirely.
  // Simple split on spaces; for complex commands authors should use shell: 'bash' explicitly.
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

/**
 * Emits a command string for OpenCode-style adapters that embed the command
 * inside generated TypeScript (execSync call).
 *
 * The command is emitted as a JSON-encoded string literal — never as a template
 * literal — so that no untrusted content can inject shell metacharacters.
 *
 * Example output: `execSync("node /abs/path/to/script.js", { encoding: 'utf8' })`
 */
export function emitCommandAsExecSync(
  command: string,
  opts?: { pluginRootVar?: string; env?: Record<string, string> }
): string {
  const { pluginRootVar, env } = opts ?? {};

  // Replace ${CLAUDE_PLUGIN_ROOT} placeholder with the runtime variable reference
  const resolved = pluginRootVar
    ? command.replace(/\$\{(?:CLAUDE_)?PLUGIN_ROOT\}/g, `\${${pluginRootVar}}`)
    : command;

  const envStr = env && Object.keys(env).length > 0
    ? `, { ...process.env, ${Object.entries(env).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')} }`
    : '';

  if (pluginRootVar) {
    // Template literal needed only for the plugin root variable — which is
    // a compile-time constant, not attacker-controlled manifest content.
    return `execSync(\`${resolved}\`, { encoding: 'utf8', shell: false${envStr} })`;
  }

  // No variable substitution — emit as plain string to avoid any template parsing.
  return `execSync(${JSON.stringify(resolved)}, { encoding: 'utf8', shell: false${envStr} })`;
}
