/**
 * AgentPlugins Hook Wrapper Generator
 *
 * Generates Node.js scripts that wrap inline handlers for command-based platforms.
 * These scripts communicate via JSON stdin/stdout following the Codex/Gemini protocol.
 */

import type { HookContext, HookResult } from '@agentplugins/contract';

export interface WrapperOptions {
  /** Target platform flavor for output format */
  platform: 'codex' | 'claude' | 'copilot' | 'gemini' | 'kimi';
  /** Hook name */
  hookName: string;
  /** Unique identifier for this wrapper */
  wrapperId: string;
}

/**
 * Generate a Node.js wrapper script that:
 * 1. Reads JSON context from stdin
 * 2. Calls the inline handler
 * 3. Writes JSON result to stdout
 * 4. Exits with appropriate code (0=success, 2=block)
 *
 * The inline handler is serialized as a string and embedded in the script.
 */
export function generateHookWrapper(
  _handlerSource: string,
  options: WrapperOptions
): string {
  const { platform, hookName, wrapperId } = options;

  return `#!/usr/bin/env node
/**
 * AgentPlugins Auto-Generated Hook Wrapper
 * Platform: ${platform}
 * Hook: ${hookName}
 * ID: ${wrapperId}
 *
 * DO NOT EDIT — This file is regenerated on each build.
 */

const { handler } = require('./__agentplugins_handlers__.js');

async function main() {
  // Read JSON context from stdin
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let ctx;
  try {
    ctx = JSON.parse(input || '{}');
  } catch {
    ctx = {};
  }

  // Normalize context fields across platforms
  const normalizedCtx = normalizeContext(ctx, '${hookName}');

  try {
    const result = await handler(normalizedCtx);

    if (!result) {
      // No result = allow operation to continue
      process.exit(0);
    }

    // Output result as JSON
    const output = formatOutput(result, '${platform}', '${hookName}');
    if (output) {
      console.log(JSON.stringify(output));
    }

    // Exit with blocking code if needed
    if (result.block || result.continue === false) {
      process.exit(${platform === 'gemini' || platform === 'copilot' ? 2 : 0});
    }

    process.exit(0);
  } catch (err) {
    // On error, output system message and exit
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(errorMsg);

    ${platform === 'copilot' ? `
    // Copilot is fail-closed: errors deny the operation
    console.log(JSON.stringify({ systemMessage: \`Hook error: \${errorMsg}\` }));
    process.exit(2);
    ` : platform === 'gemini' ? `
    // Gemini: non-zero exit = warning (not block)
    process.exit(1);
    ` : `
    // Other platforms: error is logged but doesn't block
    process.exit(0);
    `}
  }
}

function normalizeContext(ctx, eventName) {
  return {
    event: eventName,
    cwd: ctx.cwd ?? ctx.workingDirectory ?? process.cwd(),
    sessionId: ctx.session_id ?? ctx.sessionId ?? ctx.sessionID,
    model: ctx.model ?? ctx.model_name,
    permissionMode: ctx.permission_mode ?? ctx.permissionMode,
    toolName: ctx.tool_name ?? ctx.toolName ?? ctx.tool,
    toolInput: ctx.tool_input ?? ctx.toolInput ?? ctx.args,
    userPrompt: ctx.user_prompt ?? ctx.userPrompt ?? ctx.prompt,
    source: ctx.source,
    transcriptPath: ctx.transcript_path ?? ctx.transcriptPath,
    agentId: ctx.agent_id ?? ctx.agentId,
    agentType: ctx.agent_type ?? ctx.agentType ?? ctx.agent,
    turnId: ctx.turn_id ?? ctx.turnId,
    // Pass through any extra fields
    ...ctx,
  };
}

function formatOutput(result, platform, hookName) {
  if (!result) return null;

  switch (platform) {
    case 'codex':
      // Codex format: hookSpecificOutput with additionalContext
      if (result.additionalContext) {
        return {
          hookSpecificOutput: {
            hookEventName: hookName.charAt(0).toUpperCase() + hookName.slice(1),
            additionalContext: result.additionalContext,
          },
          ...(result.systemMessage ? { systemMessage: result.systemMessage } : {}),
          ...(result.continue === false ? { continue: false, stopReason: result.reason } : {}),
          ...(result.continueWith ? { continueWith: result.continueWith } : {}),
        };
      }
      return {
        ...(result.systemMessage ? { systemMessage: result.systemMessage } : {}),
        ...(result.continue === false ? { continue: false, stopReason: result.reason } : {}),
        ...(result.continueWith ? { continueWith: result.continueWith } : {}),
      };

    case 'gemini':
      // Gemini format: JSON output, exit 2 to block
      return {
        ...(result.systemMessage ? { systemMessage: result.systemMessage } : {}),
        ...(result.additionalContext ? { additionalContext: result.additionalContext } : {}),
        ...(result.continueWith ? { continueWith: result.continueWith } : {}),
      };

    case 'copilot':
      // Copilot format: similar to codex
      return {
        ...(result.systemMessage ? { systemMessage: result.systemMessage } : {}),
        ...(result.additionalContext ? { additionalContext: result.additionalContext } : {}),
        ...(result.continue === false ? { continue: false } : {}),
        ...(result.continueWith ? { continueWith: result.continueWith } : {}),
      };

    case 'claude':
    case 'kimi':
    default:
      // Generic format
      return {
        ...(result.systemMessage ? { systemMessage: result.systemMessage } : {}),
        ...(result.additionalContext ? { additionalContext: result.additionalContext } : {}),
        ...(result.continue === false ? { continue: false } : {}),
        ...(result.continueWith ? { continueWith: result.continueWith } : {}),
      };
  }
}

main();
`;
}

/**
 * Generate the shared handlers module that exports all inline handlers.
 * This is imported by each individual wrapper script.
 */
export function generateHandlersModule(
  handlers: Map<string, (ctx: HookContext) => Promise<HookResult>>
): string {
  const entries: string[] = [];

  for (const [id, handler] of handlers) {
    // Serialize the handler — note: this requires the handler to be serializable
    // For complex handlers, users should use 'command' type instead
    entries.push(`  '${id}': ${handler.toString()},`);
  }

  return `/**
 * AgentPlugins Auto-Generated Handlers Module
 *
 * DO NOT EDIT — This file is regenerated on each build.
 */

exports.handler = handler;

const handlers = {
${entries.join('\n')}
};

async function handler(ctx) {
  const handlerFn = handlers[process.env.AGENTPLUGINS_HOOK_ID];
  if (!handlerFn) {
    throw new Error(\`Unknown hook ID: \${process.env.AGENTPLUGINS_HOOK_ID}\`);
  }
  return handlerFn(ctx);
}
`;
}

/**
 * Serialize an inline handler to a string that can be embedded in a wrapper.
 * Returns null if the handler cannot be serialized.
 */
export function serializeHandler(handler: (ctx: HookContext) => Promise<HookResult>): string | null {
  try {
    const str = handler.toString();
    // Basic validation: must look like a function
    if (!str.includes('function') && !str.includes('=>')) {
      return null;
    }
    return str;
  } catch {
    return null;
  }
}
