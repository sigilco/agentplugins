/**
 * AgentPlugins subprocess utilities
 *
 * Provides spawnChild() for plugin authors who need to launch a child agent
 * process from within a code-emitting adapter (pimono, opencode). Plugins
 * must declare `capabilities: ['subprocess']` in their manifest — the lint
 * rule allows child_process usage when this capability is present.
 *
 * JSON-emitting adapters (claude, codex) already run every handler as a
 * separate OS process via the command handler mechanism; authors of those
 * plugins can spawn freely inside their shell commands without this utility.
 */

import { spawn } from 'node:child_process';

/** Options for spawnChild(). */
export interface SpawnChildOptions {
  /** The executable to run (e.g. 'claude', 'opencode'). */
  command: string;
  /** Arguments passed to the child process. */
  args?: string[];
  /** Working directory for the child process. Defaults to process.cwd(). */
  cwd?: string;
  /** Additional environment variables merged with process.env. */
  env?: Record<string, string>;
  /** Timeout in milliseconds. The child is killed if it exceeds this. */
  timeoutMs?: number;
}

/** Result returned when the child process completes. */
export interface SpawnChildResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Spawns a child process and resolves when it exits.
 *
 * Intended for use inside inline handlers of code-emitting adapters (pimono,
 * opencode) when the plugin needs to launch a sub-agent process.
 *
 * Requires `capabilities: ['subprocess']` in the plugin manifest — the lint
 * rule checks for this before allowing child_process imports.
 */
export function spawnChild(options: SpawnChildOptions): Promise<SpawnChildResult> {
  return new Promise((resolve, reject) => {
    const { command, args = [], cwd, env, timeoutMs } = options;

    const child = spawn(command, args, {
      cwd: cwd ?? process.cwd(),
      env: { ...process.env, ...env },
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (timeoutMs !== undefined) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeoutMs);
    }

    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`Child process "${command}" timed out after ${timeoutMs}ms`));
        return;
      }
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}
