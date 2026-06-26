/**
 * Hook Mapping Tests — TDD for hook-mapping.ts
 *
 * RED phase: Tests that define the expected behavior.
 * GREEN phase: Implementation in src/hook-mapping.ts
 */

import { describe, it, expect } from 'vitest';
import {
  HOOK_MAPPING,
  EVENT_TYPE_CONDITIONS,
  EVENT_HOOKS,
  buildEventHookBlock,
  buildHookArgs,
  buildHandlerInvocation,
} from '../src/hook-mapping';
import type { HookDefinition, UniversalHookName } from '@agentplugins/core/adapter';

// ─── HOOK_MAPPING Tests ────────────────────────────────────────────────────────

describe('HOOK_MAPPING', () => {
  it('should have all 8 universal → OpenCode mappings', () => {
    const expectedMappings: Record<UniversalHookName, string> = {
      sessionStart: 'event',
      sessionEnd: 'event',
      preToolUse: 'tool.execute.before',
      postToolUse: 'tool.execute.after',
      permissionRequest: 'permission.ask',
      notification: 'event',
      preCompact: 'experimental.session.compacting',
      stop: 'event',
    };

    expect(HOOK_MAPPING).toEqual(expectedMappings);
  });

  it('should map sessionStart to "event"', () => {
    expect(HOOK_MAPPING.sessionStart).toBe('event');
  });

  it('should map sessionEnd to "event"', () => {
    expect(HOOK_MAPPING.sessionEnd).toBe('event');
  });

  it('should map stop to "event"', () => {
    expect(HOOK_MAPPING.stop).toBe('event');
  });

  it('should map notification to "event"', () => {
    expect(HOOK_MAPPING.notification).toBe('event');
  });

  it('should map preToolUse to "tool.execute.before"', () => {
    expect(HOOK_MAPPING.preToolUse).toBe('tool.execute.before');
  });

  it('should map postToolUse to "tool.execute.after"', () => {
    expect(HOOK_MAPPING.postToolUse).toBe('tool.execute.after');
  });

  it('should map permissionRequest to "permission.ask"', () => {
    expect(HOOK_MAPPING.permissionRequest).toBe('permission.ask');
  });

  it('should map preCompact to "experimental.session.compacting"', () => {
    expect(HOOK_MAPPING.preCompact).toBe('experimental.session.compacting');
  });
});

// ─── EVENT_TYPE_CONDITIONS Tests ─────────────────────────────────────────────

describe('EVENT_TYPE_CONDITIONS', () => {
  it('should have condition for sessionStart → "session.created"', () => {
    expect(EVENT_TYPE_CONDITIONS.sessionStart).toBe('event.type === "session.created"');
  });

  it('should have condition for sessionEnd → "session.deleted"', () => {
    expect(EVENT_TYPE_CONDITIONS.sessionEnd).toBe('event.type === "session.deleted"');
  });

  it('should have condition for stop → "session.idle"', () => {
    expect(EVENT_TYPE_CONDITIONS.stop).toBe('event.type === "session.idle"');
  });

  it('should NOT have condition for notification (unconditional)', () => {
    expect(EVENT_TYPE_CONDITIONS.notification).toBeUndefined();
  });
});

// ─── EVENT_HOOKS Tests ────────────────────────────────────────────────────────

describe('EVENT_HOOKS', () => {
  it('should contain sessionStart, sessionEnd, notification, stop', () => {
    expect(EVENT_HOOKS).toContain('sessionStart');
    expect(EVENT_HOOKS).toContain('sessionEnd');
    expect(EVENT_HOOKS).toContain('notification');
    expect(EVENT_HOOKS).toContain('stop');
  });

  it('should have exactly 4 event hooks', () => {
    expect(EVENT_HOOKS).toHaveLength(4);
  });
});

// ─── buildEventHookBlock Tests ────────────────────────────────────────────────

describe('buildEventHookBlock', () => {
  const createHookDef = (handler: (ctx: unknown) => Promise<unknown>): HookDefinition => ({
    handler: { type: 'inline', handler },
  });

  it('should generate event hook with correct context usage (FIX: not undefined ctx)', () => {
    // CRITICAL BUG TEST: Event hooks must NOT reference undefined `ctx`
    // The generated code should use the context variable correctly
    const registrations = [
      { hook: 'sessionStart' as UniversalHookName, def: createHookDef(async () => ({})) },
    ];

    const result = buildEventHookBlock(registrations);

    // buildEventHookBlock now returns just the body (branches), not a wrapper function
    expect(result).toContain('event.type === "session.created"');
    expect(result).not.toContain('(handler)(ctx)');
    // event is in scope from the outer async ({ event }) => wrapper in generatePluginFile
    expect(result).not.toContain('const { event } = ctx');
  });

  it('should generate conditional for sessionStart with session.created', () => {
    const registrations = [
      { hook: 'sessionStart' as UniversalHookName, def: createHookDef(async () => ({})) },
    ];

    const result = buildEventHookBlock(registrations);

    expect(result).toContain('event.type === "session.created"');
  });

  it('should generate conditional for sessionEnd with session.deleted', () => {
    const registrations = [
      { hook: 'sessionEnd' as UniversalHookName, def: createHookDef(async () => ({})) },
    ];

    const result = buildEventHookBlock(registrations);

    expect(result).toContain('event.type === "session.deleted"');
  });

  it('should generate conditional for stop with session.idle', () => {
    const registrations = [
      { hook: 'stop' as UniversalHookName, def: createHookDef(async () => ({})) },
    ];

    const result = buildEventHookBlock(registrations);

    expect(result).toContain('event.type === "session.idle"');
  });

  it('should NOT generate conditional for notification (unconditional event)', () => {
    const registrations = [
      { hook: 'notification' as UniversalHookName, def: createHookDef(async () => ({})) },
    ];

    const result = buildEventHookBlock(registrations);

    // notification should NOT have a condition check since it's unconditional
    expect(result).not.toContain('if (');
    expect(result).not.toContain('event.type');
  });

  it('should handle multiple registrations (sessionStart + sessionEnd)', () => {
    const registrations = [
      { hook: 'sessionStart' as UniversalHookName, def: createHookDef(async () => ({})) },
      { hook: 'sessionEnd' as UniversalHookName, def: createHookDef(async () => ({})) },
    ];

    const result = buildEventHookBlock(registrations);

    expect(result).toContain('event.type === "session.created"');
    expect(result).toContain('event.type === "session.deleted"');
  });

  it('should return properly formatted event hook block', () => {
    const registrations = [
      { hook: 'sessionStart' as UniversalHookName, def: createHookDef(async () => ({})) },
    ];

    const result = buildEventHookBlock(registrations);

    // Returns branches body (no outer event: wrapper — that's added by generatePluginFile)
    expect(result).toContain('if (event.type');
    expect(result).toContain('event.type');
  });
});

// ─── buildHookArgs Tests ──────────────────────────────────────────────────────

describe('buildHookArgs', () => {
  it('should return "input, output" for tool.execute.before', () => {
    expect(buildHookArgs('tool.execute.before', 'preToolUse')).toBe('input, output');
  });

  it('should return "input, output" for tool.execute.after', () => {
    expect(buildHookArgs('tool.execute.after', 'postToolUse')).toBe('input, output');
  });

  it('should return "request" for permission.ask', () => {
    expect(buildHookArgs('permission.ask', 'permissionRequest')).toBe('request');
  });

  it('should return "session" for experimental.session.compacting', () => {
    expect(buildHookArgs('experimental.session.compacting', 'preCompact')).toBe('session');
  });

  it('should return "ctx" for unknown hooks', () => {
    expect(buildHookArgs('unknown', 'sessionStart')).toBe('ctx');
  });
});

// ─── buildHandlerInvocation Tests ────────────────────────────────────────────

describe('buildHandlerInvocation', () => {
  it('should generate inline handler invocation', () => {
    const handler = {
      type: 'inline' as const,
      handler: async (ctx: unknown) => ({ approved: true }),
    };

    const result = buildHandlerInvocation(handler, 'preToolUse');

    expect(result).toContain('// [preToolUse] inline handler');
    expect(result).toContain('const result = await');
    expect(result).toContain('return result;');
  });

  it('should generate command handler with Bun.$ wrapping', () => {
    const handler = {
      type: 'command' as const,
      command: 'echo "hello"',
    };

    const result = buildHandlerInvocation(handler, 'sessionStart');

    expect(result).toContain('// [sessionStart] command handler');
    expect(result).toContain('execSync');
    expect(result).toContain("import('node:child_process')");
    expect(result).toContain('JSON.parse');
  });

  it('should generate HTTP handler with fetch', () => {
    const handler = {
      type: 'http' as const,
      url: 'https://example.com/hook',
      headers: { 'Content-Type': 'application/json' },
    };

    const result = buildHandlerInvocation(handler, 'notification');

    expect(result).toContain('// [notification] HTTP handler');
    expect(result).toContain('fetch("https://example.com/hook"');
    expect(result).toContain('method: "POST"');
    expect(result).toContain('body: JSON.stringify(ctx)');
    expect(result).toContain('return response.json()');
  });

  it('should throw error for unsupported handler type', () => {
    const handler = { type: 'file' as any, filePath: '/path' };

    const result = buildHandlerInvocation(handler, 'sessionStart');

    expect(result).toContain('throw new Error');
    expect(result).toContain('Unsupported handler type');
  });
});

// ─── Integration: Full Hook Code Generation ──────────────────────────────────

describe('Hook Code Generation Integration', () => {
  const createHookDef = (handler: (ctx: unknown) => Promise<unknown>): HookDefinition => ({
    handler: { type: 'inline', handler },
  });

  it('should generate complete sessionStart event hook with correct context', () => {
    const registrations = [
      { hook: 'sessionStart' as UniversalHookName, def: createHookDef(async () => ({})) },
    ];

    const eventBlock = buildEventHookBlock(registrations);

    // buildEventHookBlock returns branches body (event: wrapper added by generatePluginFile)
    expect(eventBlock).toContain('event.type === "session.created"');
    expect(eventBlock).not.toMatch(/\(handler\)\(ctx\)/);
  });

  it('should generate tool hooks with proper input/output args', () => {
    // For tool hooks, buildHookArgs returns "input, output"
    const args = buildHookArgs('tool.execute.before', 'preToolUse');
    expect(args).toBe('input, output');
  });
});
