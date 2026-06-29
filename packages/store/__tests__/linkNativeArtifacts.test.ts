import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  lstatSync,
  readlinkSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  linkNativeArtifacts,
  unlinkNativeArtifacts,
  flushLinkErrors,
  type DetectedAgent,
} from '../src/store.js';

const PLUGIN_NAME = 'test-plugin';

function makeAgent(artifacts: DetectedAgent['artifacts']): DetectedAgent {
  return {
    name: 'opencode',
    displayName: 'OpenCode',
    skillPath: '~/.config/opencode/skills',
    binary: 'opencode',
    binaryFound: false,
    skillPathExists: false,
    manifestPath: '~/.config/opencode/config.json',
    pluginPath: '~/.config/opencode/plugins',
    pluginPathMode: 'file',
    artifacts,
  };
}

describe('linkNativeArtifacts', () => {
  let tempHome: string;
  const agent = makeAgent([{ from: 'plugins', to: '~/.config/opencode/plugins' }]);

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'link-native-'));
    vi.stubEnv('HOME', tempHome);
    flushLinkErrors();
  });

  afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true });
    vi.unstubAllEnvs();
    flushLinkErrors();
  });

  function makeFromDir(): string {
    const fromDir = join(tempHome, '.agents', 'plugins', PLUGIN_NAME, `.${agent.name}`, 'plugins');
    mkdirSync(fromDir, { recursive: true });
    return fromDir;
  }

  function getToDir(): string {
    return join(tempHome, '.config', 'opencode', 'plugins');
  }

  it('returns [] when agent has no artifacts', () => {
    expect(linkNativeArtifacts(PLUGIN_NAME, makeAgent(undefined))).toEqual([]);
  });

  it('returns [] when fromDir does not exist', () => {
    expect(linkNativeArtifacts(PLUGIN_NAME, agent)).toEqual([]);
  });

  it('symlinks a file from fromDir to toDir (basic case)', () => {
    const fromDir = makeFromDir();
    const toDir = getToDir();
    writeFileSync(join(fromDir, 'foo.ts'), '// ts');

    const result = linkNativeArtifacts(PLUGIN_NAME, agent);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      agent: agent.name,
      agentDisplayName: agent.displayName,
      linkPath: join(toDir, 'foo.ts'),
      targetPath: join(fromDir, 'foo.ts'),
      valid: true,
    });
    expect(lstatSync(result[0].linkPath).isSymbolicLink()).toBe(true);
  });

  it('.mjs → .ts rename: foo.mjs creates symlink named foo.ts', () => {
    const fromDir = makeFromDir();
    const toDir = getToDir();
    writeFileSync(join(fromDir, 'foo.mjs'), '// mjs');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = linkNativeArtifacts(PLUGIN_NAME, agent);

    expect(result).toHaveLength(1);
    expect(result[0].linkPath).toBe(join(toDir, 'foo.ts'));
    expect(readlinkSync(result[0].linkPath)).toBe(join(fromDir, 'foo.mjs'));
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`${PLUGIN_NAME}: foo.mjs is .mjs`),
    );
    warnSpy.mockRestore();
  });

  // NOTE: the current implementation intentionally leaves .js as .js (with a WARN).
  // If the desired behavior changes to also rename .js → .ts, update this test.
  it('.js files are left as .js but emit a WARN', () => {
    const fromDir = makeFromDir();
    const toDir = getToDir();
    writeFileSync(join(fromDir, 'bar.js'), '// js');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = linkNativeArtifacts(PLUGIN_NAME, agent);

    expect(result).toHaveLength(1);
    expect(result[0].linkPath).toBe(join(toDir, 'bar.js'));
    expect(readlinkSync(result[0].linkPath)).toBe(join(fromDir, 'bar.js'));
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`${PLUGIN_NAME}: bar.js is .js`),
    );
    warnSpy.mockRestore();
  });

  it('regular file with no special extension is linked unchanged', () => {
    const fromDir = makeFromDir();
    const toDir = getToDir();
    writeFileSync(join(fromDir, 'data.json'), '{}');

    const result = linkNativeArtifacts(PLUGIN_NAME, agent);

    expect(result).toHaveLength(1);
    expect(result[0].linkPath).toBe(join(toDir, 'data.json'));
  });

  it('idempotency: re-running unlinks existing dest before re-linking', () => {
    const fromDir = makeFromDir();
    const toDir = getToDir();
    writeFileSync(join(fromDir, 'foo.mjs'), '// mjs');

    linkNativeArtifacts(PLUGIN_NAME, agent);
    const result = linkNativeArtifacts(PLUGIN_NAME, agent);

    expect(result).toHaveLength(1);
    expect(result[0].linkPath).toBe(join(toDir, 'foo.ts'));
    expect(lstatSync(result[0].linkPath).isSymbolicLink()).toBe(true);
  });

  it('mkdirSync creates toDir recursively', () => {
    const fromDir = makeFromDir();
    const toDir = getToDir();
    writeFileSync(join(fromDir, 'foo.ts'), '// ts');
    expect(existsSync(toDir)).toBe(false);

    linkNativeArtifacts(PLUGIN_NAME, agent);

    expect(existsSync(toDir)).toBe(true);
  });

  it('multiple artifacts create symlinks in each toDir', () => {
    const multiAgent = makeAgent([
      { from: 'plugins', to: '~/.config/opencode/plugins' },
      { from: 'command', to: '~/.config/opencode/command' },
    ]);
    const pluginsFrom = join(tempHome, '.agents', 'plugins', PLUGIN_NAME, `.${agent.name}`, 'plugins');
    const commandFrom = join(tempHome, '.agents', 'plugins', PLUGIN_NAME, `.${agent.name}`, 'command');
    mkdirSync(pluginsFrom, { recursive: true });
    mkdirSync(commandFrom, { recursive: true });
    writeFileSync(join(pluginsFrom, 'plugin.mjs'), '// plugin');
    writeFileSync(join(commandFrom, 'cmd.ts'), '// cmd');

    const result = linkNativeArtifacts(PLUGIN_NAME, multiAgent);

    expect(result).toHaveLength(2);
    expect(result.some((r) => r.linkPath === join(tempHome, '.config', 'opencode', 'plugins', 'plugin.ts'))).toBe(true);
    expect(result.some((r) => r.linkPath === join(tempHome, '.config', 'opencode', 'command', 'cmd.ts'))).toBe(true);
  });

  it('multiple files within one artifact are symlinked individually', () => {
    const fromDir = makeFromDir();
    const toDir = getToDir();
    writeFileSync(join(fromDir, 'a.mjs'), '// a');
    writeFileSync(join(fromDir, 'b.ts'), '// b');

    const result = linkNativeArtifacts(PLUGIN_NAME, agent);

    const names = result.map((r) => r.linkPath).sort();
    expect(names).toEqual([join(toDir, 'a.ts'), join(toDir, 'b.ts')].sort());
  });

  it('directory inside fromDir is symlinked as dir type', () => {
    const fromDir = makeFromDir();
    const toDir = getToDir();
    const subdir = join(fromDir, 'subdir');
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(subdir, 'file.txt'), 'x');

    const result = linkNativeArtifacts(PLUGIN_NAME, agent);

    expect(result).toHaveLength(1);
    expect(result[0].linkPath).toBe(join(toDir, 'subdir'));
    expect(lstatSync(result[0].linkPath).isSymbolicLink()).toBe(true);
    expect(lstatSync(readlinkSync(result[0].linkPath)).isDirectory()).toBe(true);
  });

  it('recordLinkError is NOT called on success', () => {
    const fromDir = makeFromDir();
    writeFileSync(join(fromDir, 'foo.ts'), '// ts');

    linkNativeArtifacts(PLUGIN_NAME, agent);

    expect(flushLinkErrors()).toEqual([]);
  });

  it('recordLinkError is called when symlinkSync fails', () => {
    const fromDir = makeFromDir();
    const toDir = getToDir();
    writeFileSync(join(fromDir, 'foo.mjs'), '// mjs');
    // Create a non-empty directory at the destination to force symlinkSync to fail.
    mkdirSync(join(toDir, 'foo.ts'), { recursive: true });
    writeFileSync(join(toDir, 'foo.ts', 'blocker'), 'x');

    linkNativeArtifacts(PLUGIN_NAME, agent);

    expect(flushLinkErrors().length).toBeGreaterThan(0);
  });
});

describe('unlinkNativeArtifacts', () => {
  let tempHome: string;
  const agent = makeAgent([{ from: 'plugins', to: '~/.config/opencode/plugins' }]);

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'unlink-native-'));
    vi.stubEnv('HOME', tempHome);
    flushLinkErrors();
  });

  afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true });
    vi.unstubAllEnvs();
    flushLinkErrors();
  });

  function makeFromDir(): string {
    const fromDir = join(tempHome, '.agents', 'plugins', PLUGIN_NAME, `.${agent.name}`, 'plugins');
    mkdirSync(fromDir, { recursive: true });
    return fromDir;
  }

  function getToDir(): string {
    return join(tempHome, '.config', 'opencode', 'plugins');
  }

  it('no-ops when agent has no artifacts', () => {
    expect(() => unlinkNativeArtifacts(PLUGIN_NAME, makeAgent(undefined))).not.toThrow();
  });

  it('no-ops when nativeDir does not exist', () => {
    expect(() => unlinkNativeArtifacts(PLUGIN_NAME, agent)).not.toThrow();
  });

  it('removes symlink at toDir when it exists (basic)', () => {
    const fromDir = makeFromDir();
    const toDir = getToDir();
    writeFileSync(join(fromDir, 'foo.ts'), '// ts');
    linkNativeArtifacts(PLUGIN_NAME, agent);
    expect(existsSync(join(toDir, 'foo.ts'))).toBe(true);

    unlinkNativeArtifacts(PLUGIN_NAME, agent);

    expect(existsSync(join(toDir, 'foo.ts'))).toBe(false);
  });

  it('.mjs → .ts rename in reverse: foo.mjs source unlinks foo.ts', () => {
    const fromDir = makeFromDir();
    const toDir = getToDir();
    writeFileSync(join(fromDir, 'foo.mjs'), '// mjs');
    linkNativeArtifacts(PLUGIN_NAME, agent);
    expect(existsSync(join(toDir, 'foo.ts'))).toBe(true);

    unlinkNativeArtifacts(PLUGIN_NAME, agent);

    expect(existsSync(join(toDir, 'foo.ts'))).toBe(false);
    expect(existsSync(join(toDir, 'foo.mjs'))).toBe(false);
  });

  it('no-ops cleanly when toDir or link does not exist', () => {
    const fromDir = makeFromDir();
    writeFileSync(join(fromDir, 'foo.ts'), '// ts');

    expect(() => unlinkNativeArtifacts(PLUGIN_NAME, agent)).not.toThrow();
  });

  it('leaves non-symlink files untouched', () => {
    const fromDir = makeFromDir();
    const toDir = getToDir();
    writeFileSync(join(fromDir, 'foo.ts'), '// ts');
    mkdirSync(toDir, { recursive: true });
    writeFileSync(join(toDir, 'foo.ts'), '// regular file');

    unlinkNativeArtifacts(PLUGIN_NAME, agent);

    expect(existsSync(join(toDir, 'foo.ts'))).toBe(true);
    expect(lstatSync(join(toDir, 'foo.ts')).isSymbolicLink()).toBe(false);
  });

  it('multiple artifacts: unlinks in each toDir', () => {
    const multiAgent = makeAgent([
      { from: 'plugins', to: '~/.config/opencode/plugins' },
      { from: 'command', to: '~/.config/opencode/command' },
    ]);
    const pluginsFrom = join(tempHome, '.agents', 'plugins', PLUGIN_NAME, `.${agent.name}`, 'plugins');
    const commandFrom = join(tempHome, '.agents', 'plugins', PLUGIN_NAME, `.${agent.name}`, 'command');
    mkdirSync(pluginsFrom, { recursive: true });
    mkdirSync(commandFrom, { recursive: true });
    writeFileSync(join(pluginsFrom, 'plugin.mjs'), '// plugin');
    writeFileSync(join(commandFrom, 'cmd.ts'), '// cmd');
    linkNativeArtifacts(PLUGIN_NAME, multiAgent);
    expect(existsSync(join(tempHome, '.config', 'opencode', 'plugins', 'plugin.ts'))).toBe(true);
    expect(existsSync(join(tempHome, '.config', 'opencode', 'command', 'cmd.ts'))).toBe(true);

    unlinkNativeArtifacts(PLUGIN_NAME, multiAgent);

    expect(existsSync(join(tempHome, '.config', 'opencode', 'plugins', 'plugin.ts'))).toBe(false);
    expect(existsSync(join(tempHome, '.config', 'opencode', 'command', 'cmd.ts'))).toBe(false);
  });
});
