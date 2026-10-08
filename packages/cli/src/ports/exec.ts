/**
 * Node ExecPort — `node:child_process` under the island rules: one
 * executable token + argv, never a shell string (canonical shape:
 * `packages/sdk/src/ports.ts` — `run(command, args, opts)`). This is how
 * git ops reach the `git` binary and how `ln` backs `fs.symlink`.
 * Non-zero exits surface as `{code, stderr}` results, never throws — a
 * failing git probe is data, not a crash.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ExecOptions, ExecPort, ExecResult } from "../api.js";

const pExecFile = promisify(execFile);

interface ChildError {
  code?: number | string | null;
  stdout?: string;
  stderr?: string;
}

const settle = async (
  promise: Promise<{ stdout: string | Buffer; stderr: string | Buffer }>,
): Promise<ExecResult> => {
  try {
    const { stdout, stderr } = await promise;
    return { code: 0, stdout: String(stdout), stderr: String(stderr) };
  } catch (err) {
    const e = err as ChildError;
    return {
      code: typeof e.code === "number" ? e.code : 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? String(err),
    };
  }
};

export const createExecPort = (opts?: {
  maxBuffer?: number;
}): ExecPort => {
  const maxBuffer = opts?.maxBuffer ?? 16 * 1024 * 1024;
  return {
    // `options.stdin` is currently unimplemented (execFile has no stdin
    // channel); no sdk call site needs it yet — spawn-backed stdin lands
    // when a caller does.
    run: (command, args = [], options: ExecOptions = {}) =>
      settle(
        pExecFile(command, args, {
          cwd: options.cwd,
          env: options.env ? { ...process.env, ...options.env } : undefined,
          timeout: options.timeoutMs,
          maxBuffer,
        }) as Promise<{ stdout: string; stderr: string }>,
      ),
  };
};
