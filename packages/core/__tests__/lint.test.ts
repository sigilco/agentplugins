import { describe, it, expect } from 'vitest';
import type { PluginManifest } from '../src/types.js';
import {
  BUILTIN_LINT_RULES,
  lintManifest,
  registerLintRule,
  getLintRules,
  type LintIssue,
  type LintRule,
} from '../src/lint.js';

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    name: 'my-plugin',
    version: '1.0.0',
    description: 'A perfectly valid plugin description.',
    license: 'Apache-2.0',
    ...overrides,
  } as PluginManifest;
}

function runRule(
  id: string,
  manifest: PluginManifest,
  inlineHandlerSource?: string[],
): LintIssue[] {
  const rule = BUILTIN_LINT_RULES.find((r) => r.id === id);
  if (!rule) throw new Error(`Unknown rule: ${id}`);
  return rule.run({ manifest, inlineHandlerSource });
}

const errors = (issues: LintIssue[]) => issues.filter((i) => i.severity === 'error');
const warnings = (issues: LintIssue[]) =>
  issues.filter((i) => i.severity === 'warning');

describe('lint registry', () => {
  it('registers 9 built-in rules by default', () => {
    expect(BUILTIN_LINT_RULES).toHaveLength(9);
    expect(BUILTIN_LINT_RULES.map((r) => r.id)).toEqual([
      'naming',
      'versioning',
      'description',
      'license',
      'target-hygiene',
      'hook-coverage',
      'handler-safety',
      'secrets',
      'continuewith-safety',
    ]);
  });

  it('supports registering custom rules', () => {
    const before = getLintRules().length;
    const custom: LintRule = {
      id: 'custom-test-rule',
      description: 'test-only rule',
      run: ({ manifest }) =>
        manifest.name === '__custom-test-trigger__'
          ? [{ rule: 'custom-test-rule', severity: 'error', message: 'fired' }]
          : [],
    };
    registerLintRule(custom);
    expect(getLintRules().length).toBe(before + 1);
    expect(getLintRules().some((r) => r.id === 'custom-test-rule')).toBe(true);
  });
});

describe('naming rule', () => {
  it('passes for a valid kebab-case name', () => {
    expect(runRule('naming', makeManifest({ name: 'my-cool-plugin' }))).toEqual([]);
  });

  it('fails for an agentplugin-prefixed name', () => {
    const issues = errors(runRule('naming', makeManifest({ name: 'AgentPlugin-foo' })));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.field === 'name')).toBe(true);
  });

  it('fails for a non-kebab-case name', () => {
    const issues = errors(runRule('naming', makeManifest({ name: 'Foo_Bar' })));
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe('versioning rule', () => {
  it('passes for stable semver', () => {
    expect(runRule('versioning', makeManifest({ version: '1.0.0' }))).toEqual([]);
  });

  it('passes for prerelease semver', () => {
    expect(runRule('versioning', makeManifest({ version: '0.2.0-beta.1' }))).toEqual([]);
  });

  it('fails for incomplete version', () => {
    expect(errors(runRule('versioning', makeManifest({ version: '1.0' }))).length).toBe(1);
  });

  it('fails for a leading "v"', () => {
    expect(errors(runRule('versioning', makeManifest({ version: 'v1.0.0' }))).length).toBe(1);
  });
});

describe('description rule', () => {
  it('warns when description is missing', () => {
    const issues = warnings(
      runRule('description', makeManifest({ description: undefined })),
    );
    expect(issues.length).toBe(1);
    expect(issues[0].field).toBe('description');
  });

  it('warns when description is too short', () => {
    const issues = warnings(runRule('description', makeManifest({ description: 'short' })));
    expect(issues.length).toBe(1);
  });

  it('passes when description is at least 10 chars', () => {
    expect(
      runRule('description', makeManifest({ description: 'long enough text' })),
    ).toEqual([]);
  });
});

describe('license rule', () => {
  it('warns when license is missing', () => {
    expect(warnings(runRule('license', makeManifest({ license: undefined }))).length).toBe(1);
  });

  it('passes when a license is declared', () => {
    expect(runRule('license', makeManifest({ license: 'Apache-2.0' }))).toEqual([]);
  });
});

describe('target-hygiene rule', () => {
  it('warns when targets are declared without any hooks', () => {
    const issues = warnings(
      runRule('target-hygiene', makeManifest({ targets: ['claude', 'codex'] })),
    );
    expect(issues.length).toBe(1);
    expect(issues[0].message).toContain('claude');
    expect(issues[0].message).toContain('codex');
  });

  it('passes when hooks exist for the targets', () => {
    const manifest = makeManifest({
      targets: ['claude'],
      hooks: {
        preToolUse: {
          handler: { type: 'command', command: 'echo ok' },
        },
      },
    });
    expect(runRule('target-hygiene', manifest)).toEqual([]);
  });
});

describe('hook-coverage rule', () => {
  const tools = [
    {
      name: 'do-thing',
      description: 'does a thing',
      parameters: { type: 'object' as const, properties: {} },
    },
  ];

  it('warns when tools are declared without a preToolUse hook', () => {
    const issues = warnings(
      runRule(
        'hook-coverage',
        makeManifest({ tools, hooks: { postToolUse: { handler: { type: 'command', command: 'echo' } } } }),
      ),
    );
    expect(issues.length).toBe(1);
    expect(issues[0].field).toBe('hooks.preToolUse');
  });

  it('passes when tools are declared and preToolUse exists', () => {
    const manifest = makeManifest({
      tools,
      hooks: { preToolUse: { handler: { type: 'command', command: 'echo' } } },
    });
    expect(runRule('hook-coverage', manifest)).toEqual([]);
  });
});

describe('handler-safety rule', () => {
  it('flags eval() usage', () => {
    const issues = errors(
      runRule('handler-safety', makeManifest(), ['const x = eval("1+1")']),
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.rule === 'handler-safety')).toBe(true);
  });

  it('flags child_process usage', () => {
    const issues = errors(
      runRule('handler-safety', makeManifest(), ["require('child_process')"]),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('passes for clean source', () => {
    expect(
      runRule('handler-safety', makeManifest(), ['return ctx.userPrompt.toUpperCase();']),
    ).toEqual([]);
  });

  it('skips when no inline source is provided', () => {
    expect(runRule('handler-safety', makeManifest())).toEqual([]);
  });
});

describe('secrets rule', () => {
  it('flags an sk_ token in inline source', () => {
    const issues = errors(
      runRule('secrets', makeManifest(), [
        'const key = "sk_abcdefghijklmnopqrst"',
      ]),
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.rule === 'secrets')).toBe(true);
  });

  it('flags a secret in a command hook string', () => {
    const manifest = makeManifest({
      hooks: {
        preToolUse: {
          handler: { type: 'command', command: 'echo password: "supersecret12345"' },
        },
      },
    });
    expect(errors(runRule('secrets', manifest)).length).toBeGreaterThan(0);
  });

  it('passes for clean source', () => {
    expect(
      runRule('secrets', makeManifest(), ['const greeting = "hello world";']),
    ).toEqual([]);
  });
});

describe('lintManifest aggregator', () => {
  it('returns issues from multiple rules when several are violated', () => {
    const manifest = makeManifest({
      name: 'Foo_Bar',
      version: '1.0',
      description: undefined,
      license: undefined,
    });
    const issues = lintManifest(manifest);
    const violated = new Set(issues.map((i) => i.rule));
    expect(violated.has('naming')).toBe(true);
    expect(violated.has('versioning')).toBe(true);
    expect(violated.has('description')).toBe(true);
    expect(violated.has('license')).toBe(true);
  });

  it('returns no issues for a fully valid manifest', () => {
    const manifest = makeManifest();
    const builtinIssues = lintManifest(manifest).filter((i) =>
      BUILTIN_LINT_RULES.some((r) => r.id === i.rule),
    );
    expect(builtinIssues).toEqual([]);
  });
});
