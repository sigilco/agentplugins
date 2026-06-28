import { describe, expect, it } from 'vitest';
import { PluginManifestSchema, TargetPlatformSchema, ALL_TARGETS, AgentDefinitionSchema } from '../src/index.js';

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

describe('AgentDefinitionSchema — model fields', () => {
  it('accepts agent with no model (optional)', () => {
    const parsed = AgentDefinitionSchema.parse({ name: 'explorer' });
    expect(parsed.model).toBeUndefined();
    expect(parsed.fallbackModels).toBeUndefined();
  });

  it('accepts agent with model set', () => {
    const parsed = AgentDefinitionSchema.parse({ name: 'oracle', model: 'claude-opus-4-8' });
    expect(parsed.model).toBe('claude-opus-4-8');
  });

  it('accepts agent with fallbackModels', () => {
    const parsed = AgentDefinitionSchema.parse({
      name: 'fixer',
      model: 'claude-sonnet-4-6',
      fallbackModels: ['glm-5.2', 'kimi-k2'],
    });
    expect(parsed.fallbackModels).toEqual(['glm-5.2', 'kimi-k2']);
  });

  it('accepts agents[] on PluginManifest with model', () => {
    const parsed = PluginManifestSchema.parse({
      name: 'teams-roster',
      version: '0.1.0',
      description: 'test',
      agents: [
        { name: 'orchestrator', model: 'claude-opus-4-8', fallbackModels: ['glm-5.2'] },
        { name: 'explorer' },
      ],
    });
    expect(parsed.agents?.[0].model).toBe('claude-opus-4-8');
    expect(parsed.agents?.[1].model).toBeUndefined();
  });
});
