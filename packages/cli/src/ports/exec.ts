/**
 * Node ExecPort — `node:child_process` under the island rules: `exec`
 * spawns one executable token + argv with no shell (this is how git ops
 * reach the `git` binary); `run` is the shell form for internally-built
 * commands only. Non-zero exits surface as `{code, stderr}` results,
 * never as thrown errors — a failing git probe is data, not a crash.
 */
import { execFile, exec as execShell } from "node:child_process";
import { promisify } from "node:util";

import type { ExecOptions, ExecPort, ExecResult } from "../api.js";

const pExecFile = promisify(execFile);
const pExec = promisify(execShell);

interface ChildError {
  code?: number | string | null;
  stdout?: string;
  stderr?: string;
}

const childOptions = (options: ExecOptions, maxBuffer: number) => ({
  cwd: options.cwd,
  env: options.env ? { ...process.env, ...options.env } : undefined,
  timeout: options.timeoutMs,
  maxBuffer,
});

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
    exec: (file, args = [], options: ExecOptions = {}) =>
      settle(
        pExecFile(file, args, childOptions(options, maxBuffer)) as Promise<{
          stdout: string;
          stderr: string;
        }>,
      ),

    run: (command, options: ExecOptions = {}) =>
      settle(
        pExec(command, childOptions(options, maxBuffer)) as Promise<{
          stdout: string;
          stderr: string;
        }>,
      ),
  };
};
