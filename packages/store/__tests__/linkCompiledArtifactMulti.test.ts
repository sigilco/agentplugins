import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readlinkSync,
  lstatSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  linkCompiledPlugin,
  unlinkCompiledPlugin,
  flushLinkErrors,
  type DetectedAgent,
} from '../src/store.js';

function makeAgent(overrides?: Partial<DetectedAgent>): DetectedAgent {
  return {
    name: 'opencode',
    displayName: 'OpenCode',
    skillPath: '/tmp/fake-skills',
    binary: 'opencode',
    binaryFound: true,
    skillPathExists: false,
    manifestPath: '/tmp/fake-manifest',
    pluginPath: '~/.config/opencode/plugins',
    pluginPathMode: 'file',
    artifacts: [
      { from: 'plugins', to: '~/.config/opencode/plugins' },
      { from: 'command', to: '~/.config/opencode/command' },
      { from: 'agent', to: '~/.config/opencode/agent' },
    ],
    ...overrides,
  };
}

describe('linkCompiledPlugin / unlinkCompiledPlugin (multi-artifact mode)', () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = join(tmpdir(), `aptest-multi-${Date.now()}`);
    vi.stubEnv('HOME', tmpRoot);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  beforeEach(() => {
    flushLinkErrors();
  });

  function distDir(pluginName: string) {
    return join(tmpRoot, '.agents', 'plugins', pluginName, '.agentplugins-dist', 'opencode');
  }

  function writeDistFile(pluginName: string, artifactFrom: string, filename: string, content = `// ${filename}`) {
    const dir = join(distDir(pluginName), artifactFrom);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), content);
  }

  function toDir(artifactTo: string) {
    return join(tmpRoot, artifactTo.slice(2)); // strip leading '~/'
  }

  // ─── linkCompiledPlugin ─────────────────────────────────────────────────────

  describe('linkCompiledPlugin', () => {
    it('returns [] when target dist dir does not exist', () => {
      const pluginName = 'no-dist-plugin';
      const agent = makeAgent();
      expect(existsSync(distDir(pluginName))).toBe(false);
      expect(linkCompiledPlugin(pluginName, agent)).toEqual([]);
    });

    it('returns [] when artifact.from subdir does not exist', () => {
      const pluginName = 'missing-from-plugin';
      mkdirSync(distDir(pluginName), { recursive: true });
      writeDistFile(pluginName, 'plugins', 'hello.ts');
      // 'command' and 'agent' fromDirs are missing
      const agent = makeAgent();
      const result = linkCompiledPlugin(pluginName, agent);
      expect(result).toHaveLength(1);
      expect(result[0]?.linkPath).toBe(toDir('~/.config/opencode/plugins/hello.ts'));
    });

    it('creates one symlink per file in a single artifact fromDir', () => {
      const pluginName = 'single-artifact-plugin';
      writeDistFile(pluginName, 'plugins', 'plugin.ts');
      writeDistFile(pluginName, 'plugins', 'utils.ts');

      const agent = makeAgent({ artifacts: [{ from: 'plugins', to: '~/.config/opencode/plugins' }] });
      const result = linkCompiledPlugin(pluginName, agent);

      expect(result).toHaveLength(2);
      expect(existsSync(toDir('~/.config/opencode/plugins/plugin.ts'))).toBe(true);
      expect(existsSync(toDir('~/.config/opencode/plugins/utils.ts'))).toBe(true);
      expect(lstatSync(toDir('~/.config/opencode/plugins/plugin.ts')).isSymbolicLink()).toBe(true);
      expect(readlinkSync(toDir('~/.config/opencode/plugins/plugin.ts'))).toBe(join(distDir(pluginName), 'plugins', 'plugin.ts'));
    });

    it('creates symlinks in each distinct toDir for multiple artifacts', () => {
      const pluginName = 'multi-artifact-plugin';
      writeDistFile(pluginName, 'plugins', 'plugin.ts');
      writeDistFile(pluginName, 'command', 'cmd.ts');
      writeDistFile(pluginName, 'agent', 'agent.ts');

      const agent = makeAgent();
      const result = linkCompiledPlugin(pluginName, agent);

      expect(result).toHaveLength(3);
      expect(readlinkSync(toDir('~/.config/opencode/plugins/plugin.ts'))).toBe(join(distDir(pluginName), 'plugins', 'plugin.ts'));
      expect(readlinkSync(toDir('~/.config/opencode/command/cmd.ts'))).toBe(join(distDir(pluginName), 'command', 'cmd.ts'));
      expect(readlinkSync(toDir('~/.config/opencode/agent/agent.ts'))).toBe(join(distDir(pluginName), 'agent', 'agent.ts'));
    });

    it('unlinks existing symlink before recreating (idempotent)', () => {
      const pluginName = 'idempotent-plugin';
      writeDistFile(pluginName, 'plugins', 'plugin.ts');
      const firstLink = toDir('~/.config/opencode/plugins/plugin.ts');

      const agent = makeAgent({ artifacts: [{ from: 'plugins', to: '~/.config/opencode/plugins' }] });
      linkCompiledPlugin(pluginName, agent);
      const firstTarget = readlinkSync(firstLink);

      // Re-run should replace the symlink cleanly
      const result = linkCompiledPlugin(pluginName, agent);
      expect(result).toHaveLength(1);
      expect(readlinkSync(firstLink)).toBe(firstTarget);
    });

    it('creates nested toDir with recursive mkdir before symlinking', () => {
      const pluginName = 'nested-to-plugin';
      writeDistFile(pluginName, 'plugins', 'plugin.ts');
      const deepTo = '~/.config/opencode/plugins/deep/nested';
      const agent = makeAgent({ artifacts: [{ from: 'plugins', to: deepTo }] });

      linkCompiledPlugin(pluginName, agent);

      expect(existsSync(toDir(deepTo))).toBe(true);
      expect(lstatSync(toDir(`${deepTo}/plugin.ts`)).isSymbolicLink()).toBe(true);
    });

    it('returns SymlinkInfo with correct fields and valid=true on success', () => {
      const pluginName = 'symlink-info-plugin';
      writeDistFile(pluginName, 'plugins', 'plugin.ts');
      const agent = makeAgent({ artifacts: [{ from: 'plugins', to: '~/.config/opencode/plugins' }] });

      const result = linkCompiledPlugin(pluginName, agent);

      expect(result).toEqual([
        {
          agent: 'opencode',
          agentDisplayName: 'OpenCode',
          linkPath: toDir('~/.config/opencode/plugins/plugin.ts'),
          targetPath: join(distDir(pluginName), 'plugins', 'plugin.ts'),
          valid: true,
        },
      ]);
    });

    it('does not record link errors on success', () => {
      const pluginName = 'no-error-plugin';
      writeDistFile(pluginName, 'plugins', 'plugin.ts');
      const agent = makeAgent({ artifacts: [{ from: 'plugins', to: '~/.config/opencode/plugins' }] });
      linkCompiledPlugin(pluginName, agent);
      expect(flushLinkErrors()).toEqual([]);
    });

    it('records link error and continues when a symlink cannot be created', () => {
      const pluginName = 'error-recovery-plugin';
      writeDistFile(pluginName, 'plugins', 'blocked.ts');
      writeDistFile(pluginName, 'plugins', 'ok.ts');

      const linkDir = toDir('~/.config/opencode/plugins');
      mkdirSync(linkDir, { recursive: true });
      // Put a real file where the symlink should go → symlinkSync throws EEXIST
      writeFileSync(join(linkDir, 'blocked.ts'), 'i exist');

      const agent = makeAgent({ artifacts: [{ from: 'plugins', to: '~/.config/opencode/plugins' }] });
      const result = linkCompiledPlugin(pluginName, agent);

      expect(result).toHaveLength(1);
      expect(result[0]?.linkPath).toBe(join(linkDir, 'ok.ts'));

      const errs = flushLinkErrors();
      expect(errs).toHaveLength(1);
      expect(errs[0]).toMatch(/blocked\.ts.*opencode.*artifact/);
    });
  });

  // ─── unlinkCompiledPlugin ───────────────────────────────────────────────────

  describe('unlinkCompiledPlugin', () => {
    it('no-ops when target dist dir does not exist', () => {
      const pluginName = 'unlink-no-dist-plugin';
      const agent = makeAgent();
      expect(() => unlinkCompiledPlugin(pluginName, agent)).not.toThrow();
    });

    it('no-ops when artifact.from subdir does not exist', () => {
      const pluginName = 'unlink-no-from-plugin';
      mkdirSync(distDir(pluginName), { recursive: true });
      const agent = makeAgent();
      expect(() => unlinkCompiledPlugin(pluginName, agent)).not.toThrow();
    });

    it('removes symlink at toDir for each file in fromDir', () => {
      const pluginName = 'unlink-single-plugin';
      writeDistFile(pluginName, 'plugins', 'plugin.ts');
      const agent = makeAgent({ artifacts: [{ from: 'plugins', to: '~/.config/opencode/plugins' }] });
      linkCompiledPlugin(pluginName, agent);
      expect(existsSync(toDir('~/.config/opencode/plugins/plugin.ts'))).toBe(true);

      unlinkCompiledPlugin(pluginName, agent);

      expect(existsSync(toDir('~/.config/opencode/plugins/plugin.ts'))).toBe(false);
    });

    it('unlinks .mjs files by original name (does not rename to .ts)', () => {
      const pluginName = 'unlink-mjs-plugin';
      writeDistFile(pluginName, 'plugins', 'tool.mjs');
      const agent = makeAgent({ artifacts: [{ from: 'plugins', to: '~/.config/opencode/plugins' }] });
      linkCompiledPlugin(pluginName, agent);
      expect(lstatSync(toDir('~/.config/opencode/plugins/tool.mjs')).isSymbolicLink()).toBe(true);

      unlinkCompiledPlugin(pluginName, agent);

      expect(existsSync(toDir('~/.config/opencode/plugins/tool.mjs'))).toBe(false);
      expect(existsSync(toDir('~/.config/opencode/plugins/tool.ts'))).toBe(false);
    });

    it('leaves non-symlink files in toDir untouched', () => {
      const pluginName = 'unlink-leaves-real-plugin';
      writeDistFile(pluginName, 'plugins', 'plugin.ts');
      const linkDir = toDir('~/.config/opencode/plugins');
      const realFile = join(linkDir, 'user-file.ts');
      mkdirSync(linkDir, { recursive: true });
      writeFileSync(realFile, 'do not delete');

      const agent = makeAgent({ artifacts: [{ from: 'plugins', to: '~/.config/opencode/plugins' }] });
      linkCompiledPlugin(pluginName, agent);
      unlinkCompiledPlugin(pluginName, agent);

      expect(existsSync(realFile)).toBe(true);
      expect(readFileSync(realFile, 'utf-8')).toBe('do not delete');
    });

    it('unlinks symlinks across multiple artifacts', () => {
      const pluginName = 'unlink-multi-plugin';
      writeDistFile(pluginName, 'plugins', 'plugin.ts');
      writeDistFile(pluginName, 'command', 'cmd.ts');
      writeDistFile(pluginName, 'agent', 'agent.ts');

      const agent = makeAgent();
      linkCompiledPlugin(pluginName, agent);
      unlinkCompiledPlugin(pluginName, agent);

      expect(existsSync(toDir('~/.config/opencode/plugins/plugin.ts'))).toBe(false);
      expect(existsSync(toDir('~/.config/opencode/command/cmd.ts'))).toBe(false);
      expect(existsSync(toDir('~/.config/opencode/agent/agent.ts'))).toBe(false);
    });

    it('is idempotent when symlinks are already gone', () => {
      const pluginName = 'unlink-idempotent-plugin';
      writeDistFile(pluginName, 'plugins', 'plugin.ts');
      const agent = makeAgent({ artifacts: [{ from: 'plugins', to: '~/.config/opencode/plugins' }] });
      linkCompiledPlugin(pluginName, agent);
      unlinkCompiledPlugin(pluginName, agent);

      expect(() => unlinkCompiledPlugin(pluginName, agent)).not.toThrow();
      expect(existsSync(toDir('~/.config/opencode/plugins/plugin.ts'))).toBe(false);
    });
  });
});
