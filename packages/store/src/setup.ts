/**
 * Setup-script resolution, trust gating, and execution.
 *
 * A plugin may declare a `setup` shell command (top-level `manifest.setup`) or
 * rely on auto-detection (`install.sh` / `setup.sh` / `postinstall.mjs`). The
 * command runs once after `agentplugins add` and is re-runnable via
 * `agentplugins setup <name>`.
 *
 * Security model (default-deny, trust-on-first-use):
 *   - Every command passes through the lifecycle script policy. The hard
 *     denylist (`curl|sh`, `rm -rf /`, `npx --yes`, …) ALWAYS blocks, even with
 *     explicit user approval or `--yes`.
 *   - First run prompts the user (default **No**). Approval + a content hash
 *     are recorded in the plugin's meta. Re-runs with a matching hash run
 *     silently; a changed command or referenced script re-prompts.
 *   - `AGENTPLUGINS_SETUP_SCRIPTS=0` is a hard kill-switch (enforced by the
 *     caller, not here — this module stays pure about env policy).
 *
 * This module owns resolve/hash/gate/run + the meta record. The prompt UI lives
 * in the CLI; the cli orchestrates this surface. Reused: `evaluateScriptPolicy`
 * from @agentplugins/security (same gate as the install path — no side door).
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateScriptPolicy } from '@agentplugins/security';
import { readMeta, writeMeta } from './store.js';

// ─── Resolution ────────────────────────────────────────────────────────────────

export type SetupSource = 'manifest' | 'detected';

export interface ResolvedSetup {
  /** Shell command to execute (e.g. `bash install.sh`). */
  command: string;
  /** Whether the command came from `manifest.setup` or was auto-detected. */
  source: SetupSource;
}

/** Detected-script candidates, highest priority first. `cmd(file)` → command. */
const DETECT_CANDIDATES: Array<{ file: string; cmd: (f: string) => string }> = [
  { file: 'install.sh', cmd: (f) => `bash ${f}` },
  { file: 'setup.sh', cmd: (f) => `bash ${f}` },
  { file: 'postinstall.mjs', cmd: (f) => `node ${f}` },
  { file: 'postinstall.js', cmd: (f) => `node ${f}` },
];

/**
 * Resolve the setup command for a plugin. `manifest.setup` wins; otherwise the
 * first detected script file in `pluginDir` wins. Returns `null` if none.
 */
export function resolveSetupCommand(
  pluginDir: string,
  manifest: Record<string, unknown>,
): ResolvedSetup | null {
  const declared = manifest['setup'];
  if (typeof declared === 'string' && declared.trim().length > 0) {
    return { command: declared.trim(), source: 'manifest' };
  }
  for (const c of DETECT_CANDIDATES) {
    if (existsSync(join(pluginDir, c.file))) {
      return { command: c.cmd(c.file), source: 'detected' };
    }
  }
  return null;
}

// ─── Hashing ───────────────────────────────────────────────────────────────────

/** Tokens that look like a local script file referenced by the command. */
const SCRIPT_FILE = /\S+\.(?:sh|mjs|cjs|js|ts)\b/g;

/**
 * sha256 over the command string plus the byte content of every referenced
 * script file that exists under `pluginDir`. A malicious post-install edit to
 * the script body therefore changes the hash and re-triggers the trust prompt.
 */
export function hashSetupCommand(command: string, pluginDir: string): string {
  const h = createHash('sha256');
  h.update(command);
  for (const match of command.match(SCRIPT_FILE) ?? []) {
    const scriptPath = join(pluginDir, match);
    if (existsSync(scriptPath)) {
      try {
        h.update(readFileSync(scriptPath));
      } catch {
        /* unreadable file → command hash alone still covers the path */
      }
    }
  }
  return h.digest('hex');
}

// ─── Gating ────────────────────────────────────────────────────────────────────

/**
 * Run the command through the lifecycle script policy (same gate as install).
 * `phase: 'postinstall'`. Returns the policy decision + reasons; the caller
 * decides what to do (`deny` must always block execution).
 */
export function gateSetupCommand(
  command: string,
  pluginName: string,
): { decision: 'allow' | 'deny' | 'require-review'; reasons: string[] } {
  return evaluateScriptPolicy({
    dependency: pluginName,
    phase: 'postinstall',
    command,
    pluginName,
  });
}

// ─── Execution ─────────────────────────────────────────────────────────────────

export interface RunSetupOptions {
  command: string;
  /** Working directory (plugin root). */
  pluginDir: string;
  /** Extra env merged over `process.env`. */
  env?: NodeJS.ProcessEnv;
}

export interface RunSetupResult {
  /** Process exit code. */
  code: number;
}

/**
 * Spawn the command with `shell: true`, `stdio: 'inherit'` (setup scripts are
 * interactive — e.g. preset toggles). Resolves on process exit.
 *
 * ponytail: the author owns the full command string; we do not split args or
 * impose an interpreter. stdio inherit is required for interactive prompts.
 */
export function runSetupCommand(opts: RunSetupOptions): Promise<RunSetupResult> {
  return new Promise((resolve) => {
    const child = spawn(opts.command, {
      shell: true,
      cwd: opts.pluginDir,
      stdio: 'inherit',
      env: { ...process.env, ...opts.env },
    });
    child.on('exit', (code) => resolve({ code: code ?? 0 }));
    child.on('error', () => resolve({ code: 1 }));
  });
}

// ─── Trust record (persisted in .agentplugins-meta.json) ───────────────────────

export interface SetupRecord {
  command: string;
  hash: string;
  source: SetupSource;
  /** ISO timestamp the user first approved this exact command+script. */
  approvedAt: string;
  /** ISO timestamp of the most recent run. */
  lastRunAt?: string;
  /** Exit code of the most recent run. */
  lastExitCode?: number;
}

/** Read the persisted setup record for a plugin, or `null` if never approved. */
export function readSetupRecord(name: string): SetupRecord | null {
  const meta = readMeta(name);
  return meta?.setup ?? null;
}

/** Persist the setup record onto the plugin's meta (merges into existing meta). */
export function writeSetupRecord(name: string, record: SetupRecord): void {
  const meta = readMeta(name);
  if (!meta) {
    // ponytail: no meta means the plugin isn't installed; writing a setup record
    // for an unknown plugin is a caller bug. Throw rather than fabricate meta.
    throw new Error(`Cannot write setup record: plugin "${name}" is not installed`);
  }
  writeMeta({ ...meta, setup: record });
}
