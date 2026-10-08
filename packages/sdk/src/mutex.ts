/**
 * Advisory write mutex — `harness/.lock` per store-layout.md §7.2.
 * Mutual exclusion comes from `FsPort.createExclusive` (O_EXCL create);
 * a lock older than `staleMs` is presumed abandoned and broken (the
 * spec leaves the stale-breaking mechanism implementation-defined —
 * isomorphic runtimes cannot inspect holder pids, so age is the proof).
 */

import { FsPort } from "./ports.js";
import { dirname, join } from "./path.js";
import { conflict } from "./errors.js";

export interface MutexOptions {
  /** ms before an unreleased lock is treated as stale. Default 30_000. */
  staleMs?: number;
  /** Total ms to keep retrying before failing with `conflict`. Default 15_000. */
  timeoutMs?: number;
  /** Poll interval, ms. Default 40. */
  pollMs?: number;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Acquire `harness/.lock`, run `fn`, release — always, even on throw.
 * Reentrant within one Store call stack: `fn` receives the same guard so
 * nested helpers share the outer hold (a single-threaded runtime means
 * plain synchronous reentry is the only nesting we get).
 */
export const withLock = async <T>(
  fs: FsPort,
  lockPath: string,
  options: MutexOptions,
  fn: () => Promise<T>,
): Promise<T> => {
  const staleMs = options.staleMs ?? 30_000;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const pollMs = options.pollMs ?? 40;
  const deadline = Date.now() + timeoutMs;
  const token = new TextEncoder().encode(
    JSON.stringify({ ts: new Date().toISOString(), nonce: Math.random().toString(36).slice(2) }),
  );

  // The lock lives inside harness/, which a fresh store may not have yet.
  await fs.mkdir(dirname(lockPath));

  for (;;) {
    if (await fs.createExclusive(lockPath, token)) break;
    // Lock held — check for staleness, else wait.
    const st = await fs.stat(lockPath);
    const age = st === null ? 0 : Date.now() - st.mtimeMs;
    if (st !== null && age > staleMs) {
      await fs.remove(lockPath).catch(() => undefined);
      continue; // stale lock broken
    }
    if (Date.now() > deadline)
      throw conflict(`timed out acquiring ${lockPath}`);
    await sleep(pollMs);
  }

  try {
    return await fn();
  } finally {
    await fs.remove(lockPath).catch(() => undefined);
  }
};

export const lockPathFor = (harnessDir: string): string =>
  join(harnessDir, ".lock");
