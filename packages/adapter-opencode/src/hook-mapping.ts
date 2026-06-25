/**
 * Hook Mapping — OpenCode Adapter
 *
 * Maps universal AgentPlugins hooks to OpenCode hook names and generates
 * the TypeScript code for hook handlers.
 *
 * Bug fixes in this module:
 * 1. Event hooks: Handler now receives `{ event }` instead of undefined `ctx`
 * 2. Tool hooks: Handler receives `{ input, output }` instead of ignoring args
 */

import type {
  HookDefinition,
  UniversalHookName,
} from '@agentplugins/core/adapter';
import type {
  HookHandler,
  InlineHookHandler,
  CommandHookHandler,
  HttpHookHandler,
} from '@agentplugins/core';

// ─── Public Exports ────────────────────────────────────────────────────────────

/**
 * Maps universal hook names to their OpenCode equivalents.
 * OpenCode uses a single "event" hook for session/turn events with type discrimination.
 * This is Partial because OpenCode only supports 8 of the 19 universal hooks.
 */
export const HOOK_MAPPING: Partial<Record<UniversalHookName, string>> = {
  sessionStart: 'event',
  sessionEnd: 'event',
  preToolUse: 'tool.execute.before',
  postToolUse: 'tool.execute.after',
  permissionRequest: 'permission.ask',
  notification: 'event',
  preCompact: 'experimental.session.compacting',
  stop: 'event',
};

/**
 * Conditions for event-type hooks that need conditional branching on event.type.
 * Only event hooks (sessionStart, sessionEnd, stop) have type conditions.
 * Notification is unconditional.
 */
export const EVENT_TYPE_CONDITIONS: Record<string, string> = {
  sessionStart: 'event.type === "session.created"',
  sessionEnd: 'event.type === "session.deleted"',
  stop: 'event.type === "session.idle"',
};

/**
 * Hooks that are implemented via the generic "event" handler with type branching.
 */
export const EVENT_HOOKS: readonly UniversalHookName[] = [
  'sessionStart',
  'sessionEnd',
  'notification',
  'stop',
];

// ─── buildEventHookBlock ─────────────────────────────────────────────────────

/**
 * Builds the "event" hook block that conditionally routes to the correct
 * universal handler based on `event.type`.
 *
 * BUG FIX: Previously generated code called `handler(ctx)` where `ctx` was
 * undefined. Now correctly passes `{ event }` as the context since OpenCode's
 * event hooks receive `{ event }` as the parameter.
 *
 * @param registrations - Array of hook registrations to generate branches for
 * @returns Generated TypeScript code for the event hook
 */
export function buildEventHookBlock(
  registrations: { hook: UniversalHookName; def: HookDefinition }[]
): string {
  const branches: string[] = [];

  for (const reg of registrations) {
    const condition = EVENT_TYPE_CONDITIONS[reg.hook];
    if (!condition) {
      // Unconditional event hook (notification) - no if statement
      branches.push(buildHandlerInvocation(reg.def.handler, reg.hook));
      continue;
    }
    const handlerBody = buildHandlerInvocation(reg.def.handler, reg.hook);

    if (reg.hook === 'stop') {
      // stop hook: capture result to handle continueWith (autonomous loop primitive)
      branches.push(
        `      if (${condition}) {\n` +
        `        const __stopResult = await (async () => {\n` +
        `${handlerBody}\n` +
        `        })();\n` +
        `        if (__stopResult?.continueWith) {\n` +
        `          await ctx.session?.sendMessage?.(__stopResult.continueWith);\n` +
        `        }\n` +
        `        return __stopResult;\n` +
        `      }`
      );
    } else {
      branches.push(`      if (${condition}) {\n${handlerBody}\n      }`);
    }
  }

  return [
    `    event: async (ctx) => {`,
    `      const { event } = ctx;`,
    branches.join('\n'),
    `    }`,
  ].join('\n');
}

// ─── buildHookArgs ───────────────────────────────────────────────────────────

/**
 * Builds the argument list for a given OpenCode hook function signature.
 *
 * OpenCode hook signatures:
 * - tool.execute.before/after: `(input, output)` - tool input and result
 * - permission.ask: `(request)` - permission request object
 * - experimental.session.compacting: `(session)` - session object
 * - event: handled separately via buildEventHookBlock
 *
 * @param ocHook - The OpenCode hook name
 * @param _universalHook - The universal hook name (for future extensibility)
 * @returns Comma-separated argument string for the hook function signature
 */
export function buildHookArgs(
  ocHook: string,
  _universalHook: UniversalHookName
): string {
  switch (ocHook) {
    case 'tool.execute.before':
    case 'tool.execute.after':
      // Tool hooks receive input (tool arguments) and output (execution result)
      return 'input, output';
    case 'permission.ask':
      return 'request';
    case 'experimental.session.compacting':
      return 'session';
    default:
      return 'ctx';
  }
}

// ─── buildHandlerInvocation ──────────────────────────────────────────────────

/**
 * Generates the TypeScript code that invokes a handler inside an OpenCode
 * hook function.
 *
 * BUG FIX: For event hooks, the handler is now called with `{ event }`
 * instead of undefined `ctx`. For tool hooks, the handler receives
 * `{ input, output }` as the context object.
 *
 * @param handler - The handler definition to generate invocation for
 * @param hookName - The universal hook name (for comments)
 * @param ocHook - The OpenCode hook name (optional, for context-aware handling)
 * @returns Generated TypeScript code for the handler invocation
 */
export function buildHandlerInvocation(
  handler: HookHandler,
  hookName: UniversalHookName,
  ocHook?: string
): string {
  const indent = '        ';

  switch (handler.type) {
    case 'inline': {
      const ih = handler as InlineHookHandler;
      // BUG FIX: For event hooks, pass { event } instead of undefined ctx.
      // For tool hooks, pass { input, output } instead of ignoring these args.
      // For other hooks, use ctx.
      const contextArg = getContextArg(ocHook);
      return [
        `${indent}// [${hookName}] inline handler`,
        `${indent}const result = await (${ih.handler.toString()})(${contextArg});`,
        `${indent}return result;`,
      ].join('\n');
    }

    case 'command': {
      const ch = handler as CommandHookHandler;
      return [
        `${indent}// [${hookName}] command handler (wrapped via Bun.$)`,
        `${indent}const proc = Bun.$\`${ch.command}\`;`,
        `${indent}const stdout = await proc.text();`,
        `${indent}return stdout;`,
      ].join('\n');
    }

    case 'http': {
      const hh = handler as HttpHookHandler;
      return [
        `${indent}// [${hookName}] HTTP handler (wrapped via fetch)`,
        `${indent}const response = await fetch("${hh.url}", {`,
        `${indent}  method: "POST",`,
        `${indent}  headers: ${JSON.stringify(hh.headers ?? {})},`,
        `${indent}  body: JSON.stringify(ctx),`,
        `${indent}});`,
        `${indent}return response.json();`,
      ].join('\n');
    }

    default: {
      return `${indent}throw new Error("Unsupported handler type: ${(handler as { type: string }).type}");`;
    }
  }
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Determines the context argument to pass to a handler based on the hook type.
 *
 * BUG FIX: Previously always passed `ctx` which was undefined for event hooks.
 * Now correctly passes the appropriate context object based on the OpenCode hook.
 *
 * - Event hooks (ocHook === 'event'): pass `{ event }` since OpenCode provides the event
 * - Tool hooks (ocHook starts with 'tool.'): pass `{ input, output }` with tool data
 * - Permission hooks: pass `{ request }` for permission requests
 * - Session hooks: pass `{ session }` for session data
 * - Fallback: pass `ctx` for generic hooks
 */
function getContextArg(ocHook?: string): string {
  if (!ocHook) return 'ctx';

  if (ocHook === 'event') {
    // Event hooks: OpenCode passes { event }, so we pass { event } to handler
    return '{ event }';
  }

  if (ocHook === 'tool.execute.before' || ocHook === 'tool.execute.after') {
    // Tool hooks: OpenCode passes { input, output }, pass as context
    // The universal handler expects HookContext, so we provide a compatible object
    return '{ input, output }';
  }

  if (ocHook === 'permission.ask') {
    // Permission hooks: pass the request object
    return '{ request }';
  }

  if (ocHook === 'experimental.session.compacting') {
    // Session hooks: pass the session object
    return '{ session }';
  }

  return 'ctx';
}
