import { describe, it, expect } from 'vitest';
import { createClaudeAdapter } from '../src/index.js';
import type { PluginManifest } from '@agentplugins/core';

const adapter = createClaudeAdapter();

describe('Claude adapter — agent file emission', () => {
  it('emits agents/<name>.md when agents[] is present', () => {
    const manifest: PluginManifest = {
      name: 'test-plugin',
      version: '0.1.0',
      description: 'test',
      agents: [{ name: 'explorer', description: 'Fast codebase recon', prompt: 'You are explorer.' }],
    };
    const { files } = adapter.compile(manifest);
    const agentFile = files.find((f) => f.path === 'agents/explorer.md');
    expect(agentFile).toBeDefined();
    expect(agentFile!.content).toContain('name: explorer');
    expect(agentFile!.content).toContain('You are explorer.');
  });

  it('includes model: in frontmatter when agent.model is set', () => {
    const manifest: PluginManifest = {
      name: 'test-plugin',
      version: '0.1.0',
      description: 'test',
      agents: [{ name: 'oracle', model: 'claude-opus-4-8', prompt: 'You are oracle.' }],
    };
    const { files } = adapter.compile(manifest);
    const agentFile = files.find((f) => f.path === 'agents/oracle.md');
    expect(agentFile).toBeDefined();
    expect(agentFile!.content).toContain('model: claude-opus-4-8');
  });

  it('omits model: from frontmatter when agent.model is unset', () => {
    const manifest: PluginManifest = {
      name: 'test-plugin',
      version: '0.1.0',
      description: 'test',
      agents: [{ name: 'explorer', prompt: 'You are explorer.' }],
    };
    const { files } = adapter.compile(manifest);
    const agentFile = files.find((f) => f.path === 'agents/explorer.md');
    expect(agentFile).toBeDefined();
    expect(agentFile!.content).not.toContain('model:');
  });

  it('includes tools: when agent.tools is set', () => {
    const manifest: PluginManifest = {
      name: 'test-plugin',
      version: '0.1.0',
      description: 'test',
      agents: [{ name: 'fixer', tools: ['Bash', 'Edit'], model: 'claude-sonnet-4-6' }],
    };
    const { files } = adapter.compile(manifest);
    const agentFile = files.find((f) => f.path === 'agents/fixer.md');
    expect(agentFile).toBeDefined();
    expect(agentFile!.content).toContain('tools: Bash, Edit');
    expect(agentFile!.content).toContain('model: claude-sonnet-4-6');
  });

  it('emits no agent files when agents[] is absent', () => {
    const manifest: PluginManifest = {
      name: 'test-plugin',
      version: '0.1.0',
      description: 'test',
    };
    const { files } = adapter.compile(manifest);
    const agentFiles = files.filter((f) => f.path.startsWith('agents/'));
    expect(agentFiles).toHaveLength(0);
  });
});
