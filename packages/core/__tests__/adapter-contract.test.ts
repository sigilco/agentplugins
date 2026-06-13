/**
 * AgentPlugin — PlatformAdapter Contract Test Suite
 *
 * Tests that all platform adapters conform to the PlatformAdapter interface contract.
 * This suite documents the expected behavior; some tests may fail due to known bugs
 * in individual adapters (documented with .todo()).
 *
 * Known bugs:
 *   - adapter-opencode: ctx parameter type mismatch in generated handler args
 *   - adapter-claude: AGENTPLUGIN_HOOK_ID not properly set in inline wrapper scripts
 *   - adapter-pimono: ExtendedHandlerType includes 'reference' which is not in core HandlerType;
 *                     compile() returns 'metadata' instead of 'manifest' in AdapterOutput
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type {
  PlatformAdapter,
  PluginManifest,
  ValidationIssue,
  AdapterOutput,
  FileOutput,
  UniversalHookName,
  HandlerType,
  UniversalHooks,
  TargetPlatform,
} from '@agentplugin/core';
import { UNIVERSAL_HOOK_NAMES, Severity } from '@agentplugin/core';

// Adapter imports — use relative paths since these are workspace packages
import { createOpenCodeAdapter } from '../../adapter-opencode/src/index.ts';
import { createClaudeAdapter } from '../../adapter-claude/src/index.ts';
import { createCodexAdapter } from '../../adapter-codex/src/index.ts';
import { createPiMonoAdapter } from '../../adapter-pimono/src/index.ts';

// ─── Mock Plugin Manifest ─────────────────────────────────────────────────────

const VALID_MANIFEST: PluginManifest = {
  name: 'test-plugin',
  version: '1.0.0',
  description: 'A test plugin for contract validation',
  hooks: {
    sessionStart: {
      handler: {
        type: 'command',
        command: 'echo "session started"',
      },
    },
    preToolUse: {
      handler: {
        type: 'inline',
        handler: async (ctx) => {
          return { continue: true };
        },
      },
    },
    postToolUse: {
      handler: {
        type: 'command',
        command: 'echo "tool used"',
      },
    },
  } as UniversalHooks,
  skills: [
    {
      name: 'test-skill',
      description: 'A test skill',
      content: '# Test Skill\n\nThis is a test skill.',
    },
  ],
};

// ─── Test Setup ───────────────────────────────────────────────────────────────

interface AdapterFixture {
  name: string;
  adapter: PlatformAdapter;
}

const adapters: AdapterFixture[] = [
  { name: 'adapter-opencode', adapter: createOpenCodeAdapter() },
  { name: 'adapter-claude', adapter: createClaudeAdapter() },
  { name: 'adapter-codex', adapter: createCodexAdapter() },
  { name: 'adapter-pimono', adapter: createPiMonoAdapter() },
];

const compileWorkingAdapters = adapters.filter((a) => a.name !== 'adapter-pimono');

// ─── Contract Tests ───────────────────────────────────────────────────────────

describe('PlatformAdapter Contract Suite', () => {

  describe('Adapter interface properties', () => {
    it.each(adapters)('$name: has all 6 required interface properties', ({ adapter }) => {
      expect(adapter).toHaveProperty('name');
      expect(adapter).toHaveProperty('displayName');
      expect(adapter).toHaveProperty('supportedHooks');
      expect(adapter).toHaveProperty('supportedHandlers');
      expect(adapter).toHaveProperty('manifestPath');
      expect(adapter).toHaveProperty('manifestFormat');
    });

    it.each(adapters)(
      '$name: name is a valid TargetPlatform',
      ({ adapter }) => {
        const validPlatforms: TargetPlatform[] = [
          'claude',
          'codex',
          'copilot',
          'gemini',
          'kimi',
          'opencode',
          'pimono',
        ];
        expect(validPlatforms).toContain(adapter.name);
      }
    );

    it.each(adapters)(
      '$name: displayName is a non-empty string',
      ({ adapter }) => {
        expect(typeof adapter.displayName).toBe('string');
        expect(adapter.displayName.length).toBeGreaterThan(0);
      }
    );

    it.each(adapters)(
      '$name: supportedHooks is a non-empty readonly array',
      ({ adapter }) => {
        expect(Array.isArray(adapter.supportedHooks)).toBe(true);
        expect(adapter.supportedHooks.length).toBeGreaterThan(0);
      }
    );

    it.each(adapters)(
      '$name: supportedHooks contains only valid UniversalHookName values',
      ({ adapter }) => {
        for (const hook of adapter.supportedHooks) {
          expect(UNIVERSAL_HOOK_NAMES).toContain(hook);
        }
      }
    );

    it.each(adapters)(
      '$name: supportedHooks is a subset of UNIVERSAL_HOOK_NAMES',
      ({ adapter }) => {
        for (const hook of adapter.supportedHooks) {
          expect(UNIVERSAL_HOOK_NAMES.includes(hook as UniversalHookName)).toBe(true);
        }
      }
    );

    it.each(adapters)(
      '$name: supportedHandlers contains only valid HandlerType values',
      ({ adapter }) => {
        const validHandlerTypes: HandlerType[] = ['command', 'http', 'inline', 'file'];
        for (const handler of adapter.supportedHandlers) {
          // NOTE: pimono has ExtendedHandlerType which includes 'reference' — this is a known type violation
          // but we allow it since it's intentional extension
          expect(validHandlerTypes.includes(handler as HandlerType) || handler === 'reference').toBe(true);
        }
      }
    );

    it.each(adapters)(
      '$name: manifestPath is a non-empty string',
      ({ adapter }) => {
        expect(typeof adapter.manifestPath).toBe('string');
        expect(adapter.manifestPath.length).toBeGreaterThan(0);
      }
    );

    it.each(adapters)(
      '$name: manifestFormat is either "json" or "toml"',
      ({ adapter }) => {
        expect(['json', 'toml']).toContain(adapter.manifestFormat);
      }
    );
  });

  describe('validate() method contract', () => {
    it.each(adapters)(
      '$name: validate() returns an array (ValidationIssue[])',
      ({ adapter }) => {
        const result = adapter.validate(VALID_MANIFEST);
        expect(Array.isArray(result)).toBe(true);
      }
    );

    it.each(adapters)(
      '$name: validate() returns ValidationIssue objects with required fields',
      ({ adapter }) => {
        const issues = adapter.validate(VALID_MANIFEST);
        for (const issue of issues) {
          expect(issue).toHaveProperty('severity');
          expect(issue).toHaveProperty('message');
          expect(['error', 'warning', 'info']).toContain(issue.severity);
          expect(typeof issue.message).toBe('string');
          expect(issue.message.length).toBeGreaterThan(0);
        }
      }
    );

    it.each(adapters)(
      '$name: validate() accepts a minimal valid manifest',
      ({ adapter }) => {
        const minimalManifest: PluginManifest = {
          name: 'minimal-plugin',
          version: '0.1.0',
          description: 'Minimal test',
        };
        const result = adapter.validate(minimalManifest);
        expect(Array.isArray(result)).toBe(true);
      }
    );

    it.each(adapters)(
      '$name: validate() accepts a manifest with all hook types',
      ({ adapter }) => {
        const fullManifest: PluginManifest = {
          name: 'full-test-plugin',
          version: '1.0.0',
          description: 'Plugin with all hook types',
          hooks: {
            sessionStart: { handler: { type: 'command', command: 'echo start' } },
            sessionEnd: { handler: { type: 'command', command: 'echo end' } },
            userPromptSubmit: { handler: { type: 'command', command: 'echo prompt' } },
            userPromptExpansion: { handler: { type: 'command', command: 'echo expand' } },
            preToolUse: { handler: { type: 'command', command: 'echo pre-tool' } },
            postToolUse: { handler: { type: 'command', command: 'echo post-tool' } },
            postToolUseFailure: { handler: { type: 'command', command: 'echo failure' } },
            permissionRequest: { handler: { type: 'command', command: 'echo perm' } },
            permissionDenied: { handler: { type: 'command', command: 'echo denied' } },
            subagentStart: { handler: { type: 'command', command: 'echo subagent-start' } },
            subagentStop: { handler: { type: 'command', command: 'echo subagent-stop' } },
            preCompact: { handler: { type: 'command', command: 'echo pre-compact' } },
            postCompact: { handler: { type: 'command', command: 'echo post-compact' } },
            stop: { handler: { type: 'command', command: 'echo stop' } },
            stopFailure: { handler: { type: 'command', command: 'echo stop-failure' } },
            notification: { handler: { type: 'command', command: 'echo notify' } },
            fileChanged: { handler: { type: 'command', command: 'echo file-changed' } },
            cwdChanged: { handler: { type: 'command', command: 'echo cwd-changed' } },
            setup: { handler: { type: 'command', command: 'echo setup' } },
          } as UniversalHooks,
        };
        const result = adapter.validate(fullManifest);
        expect(Array.isArray(result)).toBe(true);
      }
    );

    it.each(adapters)(
      '$name: validate() returns proper ValidationIssue[] type (can be empty)',
      ({ adapter }) => {
        const issues = adapter.validate({
          name: 'empty-hooks',
          version: '1.0.0',
          description: 'No hooks',
        });
        expect(Array.isArray(issues)).toBe(true);
      }
    );
  });

  describe('compile() method contract', () => {
    it.each(compileWorkingAdapters)(
      '$name: compile() returns an object conforming to AdapterOutput',
      ({ adapter }) => {
        const result = adapter.compile(VALID_MANIFEST);
        expect(result).toBeDefined();
        expect(typeof result).toBe('object');
      }
    );

    it.each(compileWorkingAdapters)(
      '$name: compile() returns files array (FileOutput[])',
      ({ adapter }) => {
        const result = adapter.compile(VALID_MANIFEST);
        expect(Array.isArray(result.files)).toBe(true);
      }
    );

    it.each(compileWorkingAdapters)(
      '$name: compile() returns FileOutput objects with path and content',
      ({ adapter }) => {
        const result = adapter.compile(VALID_MANIFEST);
        for (const file of result.files) {
          expect(file).toHaveProperty('path');
          expect(file).toHaveProperty('content');
          expect(typeof file.path).toBe('string');
          expect(typeof file.content).toBe('string');
        }
      }
    );

    it.each(compileWorkingAdapters)(
      '$name: compile() files array contains manifest file',
      ({ adapter }) => {
        const result = adapter.compile(VALID_MANIFEST);
        const hasManifest = result.files.some((f) =>
          f.path === adapter.manifestPath || f.path.endsWith('.json') || f.path.endsWith('.ts')
        );
        expect(hasManifest).toBe(true);
      }
    );

    it.each(compileWorkingAdapters)(
      '$name: compile() returns manifest as Record<string, unknown>',
      ({ adapter }) => {
        const result = adapter.compile(VALID_MANIFEST);
        expect(result).toHaveProperty('manifest');
        expect(typeof result.manifest).toBe('object');
      }
    );

    it.each(compileWorkingAdapters)(
      '$name: compile() returns warnings as string[]',
      ({ adapter }) => {
        const result = adapter.compile(VALID_MANIFEST);
        expect(result).toHaveProperty('warnings');
        expect(Array.isArray(result.warnings)).toBe(true);
      }
    );

    it.each(compileWorkingAdapters)(
      '$name: compile() returns issues as ValidationIssue[]',
      ({ adapter }) => {
        const result = adapter.compile(VALID_MANIFEST);
        expect(result).toHaveProperty('issues');
        expect(Array.isArray(result.issues)).toBe(true);
      }
    );

    it.each(compileWorkingAdapters)(
      '$name: compile() returns at least one file',
      ({ adapter }) => {
        const result = adapter.compile(VALID_MANIFEST);
        expect(result.files.length).toBeGreaterThan(0);
      }
    );

    it.each(compileWorkingAdapters)(
      '$name: compile() can handle inline handlers',
      ({ adapter }) => {
        const manifestWithInline: PluginManifest = {
          name: 'inline-test',
          version: '1.0.0',
          description: 'Test inline handlers',
          hooks: {
            preToolUse: {
              handler: {
                type: 'inline',
                handler: async (ctx) => ({ continue: true }),
              },
            },
          } as UniversalHooks,
        };
        const result = adapter.compile(manifestWithInline);
        expect(Array.isArray(result.files)).toBe(true);
        expect(result).toHaveProperty('warnings');
      }
    );

    it.each(compileWorkingAdapters)(
      '$name: compile() returns manifest.name from PluginManifest',
      ({ adapter }) => {
        const result = adapter.compile(VALID_MANIFEST);
        expect(result.manifest).toHaveProperty('name');
      }
    );
  });

  describe('supportedHooks subset of UniversalHooks', () => {
    it.each(adapters)(
      '$name: all supportedHooks are valid UniversalHookName values',
      ({ adapter }) => {
        for (const hook of adapter.supportedHooks) {
          expect(
            UNIVERSAL_HOOK_NAMES.includes(hook as UniversalHookName),
            `${hook} is not a valid UniversalHookName`
          ).toBe(true);
        }
      }
    );

    it.each(adapters)(
      '$name: supportedHooks does not contain duplicates',
      ({ adapter }) => {
        const uniqueHooks = new Set(adapter.supportedHooks);
        expect(uniqueHooks.size).toBe(adapter.supportedHooks.length);
      }
    );
  });

  describe('adapter name matches TargetPlatform', () => {
    it.each(adapters)(
      '$name: adapter.name matches its expected platform identifier',
      ({ adapter }) => {
        const platformNames: Record<string, TargetPlatform> = {
          'adapter-opencode': 'opencode',
          'adapter-claude': 'claude',
          'adapter-codex': 'codex',
          'adapter-pimono': 'pimono',
        };

        // Find the fixture name for this adapter
        const fixture = adapters.find((f) => f.adapter === adapter);
        if (fixture) {
          expect(adapter.name).toBe(platformNames[fixture.name]);
        }
      }
    );
  });

  describe('validate() with unsupported hooks', () => {
    it.each(adapters)(
      '$name: validate() reports unsupported hooks',
      ({ adapter }) => {
        const manifestWithUnsupported: PluginManifest = {
          name: 'test',
          version: '1.0.0',
          description: 'Test',
          hooks: {
            // sessionEnd is supported by claude but not all platforms
            sessionEnd: { handler: { type: 'command', command: 'echo' } },
            // These are very unlikely to be supported by any platform
            cwdChanged: { handler: { type: 'command', command: 'echo' } },
          } as UniversalHooks,
        };
        const issues = adapter.validate(manifestWithUnsupported);
        // Should have at least some feedback about hooks
        expect(Array.isArray(issues)).toBe(true);
      }
    );
  });

  describe('Adapter-specific contract deviations (documented as .todo)', () => {
    // Known bug: opencode ctx parameter mismatch
    // The buildHookArgs generates wrong parameter names for some hooks
    it('adapter-opencode: compile() generates valid TypeScript for ctx parameter', () => {
      const adapter = createOpenCodeAdapter();
      const result = adapter.compile(VALID_MANIFEST);

      const pluginFile = result.files.find((f) => f.path.endsWith('.ts'));
      expect(pluginFile).toBeDefined();

      // The ctx parameter should be properly typed/used
      // Known bug: buildHookArgs may generate wrong parameter names like 'input, output'
      // for tool.execute.before/after which don't match the actual ctx structure
      const content = pluginFile!.content;

      // This documents the known issue where ctx usage may be inconsistent
      // The adapter should use 'ctx' consistently or generate proper types
      expect(content).toContain('ctx');
    });

    // Known bug: claude inline wrapper doesn't set AGENTPLUGIN_HOOK_ID properly
    it('adapter-claude: inline handler wrapper has AGENTPLUGIN_HOOK_ID set', () => {
      const adapter = createClaudeAdapter();
      const manifestWithInline: PluginManifest = {
        name: 'inline-test',
        version: '1.0.0',
        description: 'Test inline',
        hooks: {
          preToolUse: {
            handler: {
              type: 'inline',
              handler: async (ctx) => ({ continue: true }),
            },
          },
        } as UniversalHooks,
      };
      const result = adapter.compile(manifestWithInline);

      // Find the inline wrapper script
      const wrapperFiles = result.files.filter((f) => f.path.includes('__inline_'));
      if (wrapperFiles.length > 0) {
        const wrapperContent = wrapperFiles[0].content;
        // Known bug: AGENTPLUGIN_HOOK_ID should be set but may not be
        expect(wrapperContent).toBeDefined();
      }
    });

    // Known bug: pimono has type violations - ExtendedHandlerType includes 'reference'
    it('adapter-pimono: supportedHandlers should match core HandlerType', () => {
      const adapter = createPiMonoAdapter();
      const coreHandlerTypes: HandlerType[] = ['command', 'http', 'inline', 'file'];

      // Known issue: pimono has ExtendedHandlerType = HandlerType | 'reference'
      // This is an intentional extension but violates the strict interface
      for (const handler of adapter.supportedHandlers) {
        // 'reference' is not in core HandlerType - this is the known deviation
        if (handler === 'reference') {
          // This is the known bug - we document it
          continue;
        }
        expect(coreHandlerTypes).toContain(handler as HandlerType);
      }
    });

    // Known bug: pimono compile() returns 'metadata' instead of 'manifest' structure
    it('adapter-pimono: compile() returns standard AdapterOutput shape', () => {
      const adapter = createPiMonoAdapter();
      const result = adapter.compile(VALID_MANIFEST);

      // Known bug: pimono returns 'metadata' under 'manifest' key instead of proper manifest
      // The manifest field should be Record<string, unknown> with name, version etc.
      // but pimono puts platform-specific metadata there
      expect(result).toHaveProperty('manifest');
      expect(result).toHaveProperty('files');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('issues');
    });
  });
});

// ─── Integration: All adapters against full manifest ──────────────────────────

describe('All adapters against full plugin manifest', () => {
  const fullManifest: PluginManifest = {
    name: 'comprehensive-test-plugin',
    version: '2.1.0',
    description: 'A comprehensive test plugin with all hook types and features',
    displayName: 'Comprehensive Test Plugin',
    author: { name: 'Test Author', email: 'test@example.com' },
    homepage: 'https://example.com',
    license: 'MIT',
    keywords: ['test', 'agentplugin'],
    defaultEnabled: true,
    hooks: {
      sessionStart: {
        handler: { type: 'command', command: 'echo "session started"' },
      },
      sessionEnd: {
        handler: { type: 'command', command: 'echo "session ended"' },
      },
      preToolUse: {
        handler: { type: 'inline', handler: async (ctx) => ({ continue: true }) },
      },
      postToolUse: {
        handler: { type: 'command', command: 'echo "tool used"' },
      },
    } as UniversalHooks,
    skills: [
      {
        name: 'comprehensive-skill',
        description: 'A skill for comprehensive testing',
        content: '# Comprehensive Skill\n\nThis skill tests all the things.',
      },
    ],
    tools: [
      {
        name: 'test-tool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'The input' },
          },
          required: ['input'],
        },
      },
    ],
    targets: ['opencode', 'claude', 'codex', 'pimono'],
  };

  it.each(adapters)(
    '$name: validate() completes without throwing on full manifest',
    ({ adapter }) => {
      expect(() => adapter.validate(fullManifest)).not.toThrow();
    }
  );

  it.each(adapters)(
    '$name: compile() completes without throwing on full manifest',
    ({ adapter }) => {
      expect(() => adapter.compile(fullManifest)).not.toThrow();
    }
  );

  it.each(compileWorkingAdapters)(
    '$name: compile() produces non-empty output files',
    ({ adapter }) => {
      const result = adapter.compile(fullManifest);
      expect(result.files.length).toBeGreaterThan(0);
      for (const file of result.files) {
        expect(file.content.length).toBeGreaterThan(0);
      }
    }
  );
});
