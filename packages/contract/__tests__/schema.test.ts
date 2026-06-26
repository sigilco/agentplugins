import { describe, expect, it } from 'vitest';
import { PluginManifestSchema, TargetPlatformSchema, ALL_TARGETS } from '../src/index.js';

describe('PluginManifestSchema (single source of truth)', () => {
  it('accepts a minimal valid manifest', () => {
    const parsed = PluginManifestSchema.parse({
      name: 'my-plugin',
      version: '1.0.0',
      description: 'test',
    });
    expect(parsed.name).toBe('my-plugin');
  });

  it('rejects an empty object (required fields missing)', () => {
    expect(() => PluginManifestSchema.parse({})).toThrow();
  });

  it('rejects an invalid target platform', () => {
    expect(() => TargetPlatformSchema.parse('not-a-platform')).toThrow();
  });

  it('ALL_TARGETS matches the zod enum set', () => {
    // Catches drift between the const array and the zod enum.
    const enumValues = TargetPlatformSchema.options;
    expect(new Set(enumValues)).toEqual(new Set(ALL_TARGETS));
  });

  it('accepts sidecar (currently documentation-only, see B21)', () => {
    const parsed = PluginManifestSchema.parse({
      name: 'p',
      version: '0.0.0',
      description: 'x',
      sidecar: { command: 'node server.js' },
    });
    expect(parsed.sidecar?.command).toBe('node server.js');
  });
});
