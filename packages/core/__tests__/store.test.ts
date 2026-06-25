import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readlinkSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  AGENT_PATHS,
  linkCompiledPlugin,
  unlinkCompiledPlugin,
  getSymlinks,
  type DetectedAgent,
} from '../dist/store.js';

// ─── AGENT_PATHS shape ────────────────────────────────────────────────────────

describe('AGENT_PATHS', () => {
  it('has pluginPath, pluginPathMode, and artifacts for opencode', () => {
    const opencode = AGENT_PATHS.find((e) => e.name === 'opencode');
    expect(opencode?.pluginPath).toBe('~/.config/opencode/plugins');
    expect(opencode?.pluginPathMode).toBe('file');
    expect(opencode?.artifacts).toBeDefined();
    expect(opencode?.artifacts?.some((a) => a.from === 'plugins')).toBe(true);
    expect(opencode?.artifacts?.some((a) => a.from === 'command')).toBe(true);
  });

  it('has pluginPath and pluginPathMode for pimono', () => {
    const pimono = AGENT_PATHS.find((e) => e.name === 'pimono');
    expect(pimono?.pluginPath).toBe('~/.pi/agent/extensions');
    expect(pimono?.pluginPathMode).toBe('dir');
  });

  it('does not have pluginPath for claude / codex', () => {
    const claude = AGENT_PATHS.find((e) => e.name === 'claude');
    const codex = AGENT_PATHS.find((e) => e.name === 'codex');
    expect(claude?.pluginPath).toBeUndefined();
    expect(codex?.pluginPath).toBeUndefined();
  });
});

// ─── linkCompiledPlugin / unlinkCompiledPlugin ────────────────────────────────

function makeAgent(overrides: Partial<DetectedAgent>): DetectedAgent {
  return {
    name: 'opencode',
    displayName: 'OpenCode',
    skillPath: '/tmp/fake-skills',
    binary: 'opencode',
    binaryFound: true,
    skillPathExists: false,
    manifestPath: '/tmp/fake-manifest',
    ...overrides,
  };
}

describe('linkCompiledPlugin (file mode — opencode)', () => {
  let tmpRoot: string;
  let pluginName: string;
  let storeDir: string;
  let distDir: string;
  let pluginDir: string;

  beforeEach(() => {
    tmpRoot = join(tmpdir(), `aptest-${Date.now()}`);
    pluginName = 'testplugin';
    storeDir = join(tmpRoot, 'store');
    pluginDir = join(storeDir, pluginName);
    distDir = join(pluginDir, '.agentplugins-dist', 'opencode');
    mkdirSync(distDir, { recursive: true });
    writeFileSync(join(distDir, `${pluginName}.ts`), '// generated\nexport default {};');
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('returns empty array when dist dir does not exist at expected path', () => {
    const pluginPath = join(tmpRoot, 'opencode-plugins');
    mkdirSync(pluginPath, { recursive: true });

    // linkCompiledPlugin uses getPluginDistPath(pluginName) = ~/.agents/plugins/<name>/.agentplugins-dist
    // For a nonexistent plugin the dist dir won't exist → empty array
    const agentNoDist = makeAgent({ pluginPath, pluginPathMode: 'file' });
    const result = linkCompiledPlugin('nonexistent-plugin', agentNoDist);
    expect(result).toEqual([]);
  });

  it('returns empty array when agent has no pluginPath', () => {
    const agent = makeAgent({ pluginPath: undefined, pluginPathMode: undefined });
    const result = linkCompiledPlugin(pluginName, agent);
    expect(result).toEqual([]);
  });

  it('returns empty array when agent has pluginPath but no pluginPathMode', () => {
    const agent = makeAgent({ pluginPath: '/some/path', pluginPathMode: undefined });
    const result = linkCompiledPlugin(pluginName, agent);
    expect(result).toEqual([]);
  });
});

describe('unlinkCompiledPlugin', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = join(tmpdir(), `aptest-unlink-${Date.now()}`);
    mkdirSync(tmpRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('is a no-op when agent has no pluginPath', () => {
    const agent = makeAgent({ pluginPath: undefined });
    expect(() => unlinkCompiledPlugin('any', agent)).not.toThrow();
  });

  it('is a no-op when link does not exist', () => {
    const pluginPath = join(tmpRoot, 'plugins');
    mkdirSync(pluginPath);
    const agent = makeAgent({ pluginPath, pluginPathMode: 'file' });
    expect(() => unlinkCompiledPlugin('myplugin', agent)).not.toThrow();
  });
});

// ─── getSymlinks with compiled links ─────────────────────────────────────────

describe('getSymlinks', () => {
  it('returns empty array when no agents have links', () => {
    const agents: DetectedAgent[] = [
      makeAgent({ name: 'opencode', skillPath: '/nonexistent/skills', pluginPath: '/nonexistent/plugins', pluginPathMode: 'file' }),
    ];
    const result = getSymlinks('no-such-plugin', agents);
    expect(result).toHaveLength(0);
  });
});
