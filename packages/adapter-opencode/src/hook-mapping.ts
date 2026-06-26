/**
 * Hook Mapping — OpenCode Adapter
 *
 * Maps universal AgentPlugins hooks to OpenCode hook names and generates
 * the TypeScript code for hook handlers.
 *
 * buildHandlerInvocation is imported from handler-invocation.ts (single copy).
 */

import type {
  HookDefinition,
  UniversalHookName,
} from '@agentplugins/core/adapter';
import { buildHandlerInvocation } from './handler-invocation.js';
export { buildHandlerInvocation };

// ─── Hook mapping table ───────────────────────────────────────────────────────

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

export const EVENT_TYPE_CONDITIONS: Record<string, string> = {
  sessionStart: 'event.type === "session.created"',
  sessionEnd: 'event.type === "session.deleted"',
  stop: 'event.type === "session.idle"',
};

export const EVENT_HOOKS: readonly UniversalHookName[] = [
  'sessionStart',
  'sessionEnd',
  'notification',
  'stop',
];

// ─── buildEventHookBlock ──────────────────────────────────────────────────────

export function buildEventHookBlock(
  registrations: { hook: UniversalHookName; def: HookDefinition }[]
): string {
  const branches: string[] = [];

  for (const reg of registrations) {
    const condition = EVENT_TYPE_CONDITIONS[reg.hook];
    if (!condition) {
      branches.push(buildHandlerInvocation(reg.def.handler, reg.hook, '{ event }'));
      continue;
    }
    const handlerBody = buildHandlerInvocation(reg.def.handler, reg.hook, '{ event }');

    if (reg.hook === 'stop') {
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

  return branches.join('\n');
}

// ─── buildHookArgs ────────────────────────────────────────────────────────────

export function buildHookArgs(
  ocHook: string,
  _universalHook: UniversalHookName
): string {
  switch (ocHook) {
    case 'tool.execute.before':
    case 'tool.execute.after':
      return 'input, output';
    case 'permission.ask':
      return 'request';
    case 'experimental.session.compacting':
      return 'session';
    default:
      return 'ctx';
  }
}
