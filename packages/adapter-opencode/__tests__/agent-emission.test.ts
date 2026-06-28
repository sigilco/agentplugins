import { describe, it, expect } from 'vitest';
import { generateAgentFiles } from '../src/output-generators.js';
import type { PluginManifest } from '@agentplugins/core';

describe('OpenCode adapter — agent file emission', () => {
  it('emits agent/<name>.md when agents[] is present', () => {
    const manifest: PluginManifest = {
      name: 'test-plugin',
      version: '0.1.0',
      description: 'test',
      agents: [{ name: 'explorer', description: 'Fast recon', prompt: 'You are explorer.' }],
    };
    const files = generateAgentFiles(manifest);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('agent/explorer.md');
    expect(files[0].content).toContain('description: Fast recon');
    expect(files[0].content).toContain('You are explorer.');
  });

  it('includes model: in frontmatter when agent.model is set', () => {
    const manifest: PluginManifest = {
      name: 'test-plugin',
      version: '0.1.0',
      description: 'test',
      agents: [{ name: 'oracle', model: 'claude-opus-4-8', prompt: 'You are oracle.' }],
    };
    const files = generateAgentFiles(manifest);
    expect(files[0].content).toContain('model: claude-opus-4-8');
  });

  it('omits model: from frontmatter when agent.model is unset', () => {
    const manifest: PluginManifest = {
      name: 'test-plugin',
      version: '0.1.0',
      description: 'test',
      agents: [{ name: 'explorer', prompt: 'You are explorer.' }],
    };
    const files = generateAgentFiles(manifest);
    expect(files[0].content).not.toContain('model:');
  });

  it('returns empty array when agents[] is absent', () => {
    const manifest: PluginManifest = {
      name: 'test-plugin',
      version: '0.1.0',
      description: 'test',
    };
    const files = generateAgentFiles(manifest);
    expect(files).toHaveLength(0);
  });
});
