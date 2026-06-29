import { describe, expect, it } from 'vitest';
import { emitCommandHandler, emitCommandAsExecSync, emitInlineHandler } from '../src/emit.js';
import type { CommandHookHandler, InlineHookHandler } from '@agentplugins/contract';

describe('emitCommandHandler', () => {
  it('splits a simple command into argv', () => {
    const h: CommandHookHandler = { type: 'command', command: 'node script.js' };
    expect(emitCommandHandler(h)).toEqual({ command: 'node', args: ['script.js'] });
  });

  it('handles single-token commands', () => {
    const h: CommandHookHandler = { type: 'command', command: 'true' };
    expect(emitCommandHandler(h)).toEqual({ command: 'true', args: [] });
  });

  it('throws on empty command', () => {
    expect(() => emitCommandHandler({ type: 'command', command: '' })).toThrow();
  });
});

describe('emitCommandAsExecSync (injection regression)', () => {
  // The plan's Verification fixture: a command containing backtick/`${}`/`;`
  // must NOT be interpolated into the emitted template literal.
  it('JSON-encodes a malicious command string verbatim (no shell interpretation)', () => {
    const malicious = 'node; rm -rf /; echo `${process.env}`';
    const h: CommandHookHandler = { type: 'command', command: malicious };
    const out = emitCommandAsExecSync(h);
    // The raw malicious string appears only inside a JSON-encoded double-quoted literal
    expect(out).toContain(JSON.stringify(malicious));
    // The command is assigned from a JSON string literal, NOT a template literal —
    // i.e. `const __cmdStr = "..."`, never `const __cmdStr = `...``
    expect(out).toContain('const __cmdStr = "');
    expect(out).not.toContain('const __cmdStr = `');
    // shell: true never appears
    expect(out).not.toContain('shell: true');
  });

  it('substitutes PLUGIN_ROOT via runtime .replace(), not template interpolation', () => {
    const h: CommandHookHandler = {
      type: 'command',
      command: 'node ${CLAUDE_PLUGIN_ROOT}/run.js',
    };
    const out = emitCommandAsExecSync(h, { pluginRootVar: '__pluginRoot' });
    // The sentinel-replace pattern must be present (runtime .replace, not template literal)
    expect(out).toContain('.replace(/__PLUGIN_ROOT__/g, __pluginRoot)');
    // The literal ${CLAUDE_PLUGIN_ROOT} must NOT leak into a template literal
    expect(out).not.toContain('`${CLAUDE_PLUGIN_ROOT}');
    expect(out).not.toContain('${__pluginRoot}');
  });

  it('emits a plain JSON literal when no plugin-root var is in use', () => {
    const h: CommandHookHandler = { type: 'command', command: 'echo hi' };
    const out = emitCommandAsExecSync(h);
    expect(out).toContain('"echo hi"');
    expect(out).not.toContain('.replace');
  });
});

describe('emitInlineHandler', () => {
  it('serialises a real function', () => {
    const h: InlineHookHandler = {
      type: 'inline',
      handler: async () => ({ continue: true }),
    };
    const src = emitInlineHandler(h);
    expect(src).toContain('async');
    expect(src).toContain('continue');
  });

  it('returns null for a non-function handler', () => {
    expect(emitInlineHandler({ handler: 'not a fn' } as unknown as InlineHookHandler)).toBeNull();
  });
});
