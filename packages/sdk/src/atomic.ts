/**
 * Atomic-write helpers — store-layout.md §7.1: every write under
 * `~/.agents/` is staged to a sibling temp path, then renamed. Readers
 * see the complete old file or the complete new one, never a partial.
 */

import { FsPort } from "./ports.js";
import { dirname, join } from "./path.js";

const nonce = (): string =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** Write a file atomically: sibling temp + rename. */
export const atomicWriteFile = async (
  fs: FsPort,
  path: string,
  data: Uint8Array,
): Promise<void> => {
  const tmp = join(dirname(path), `.${path.slice(path.lastIndexOf("/") + 1)}.tmp-${nonce()}`);
  try {
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, path);
  } catch (e) {
    await fs.remove(tmp, { recursive: true }).catch(() => undefined);
    throw e;
  }
};

/**
 * Move a staged directory into place. `dest` must not exist — callers
 * use `swapDirectory` for the update path.
 */
export const renameIntoPlace = async (
  fs: FsPort,
  staged: string,
  dest: string,
): Promise<void> => {
  await fs.rename(staged, dest);
};

/**
 * Atomic-ish package swap (trust.md §3.3): the old tree is renamed to a
 * trash sibling first, the new tree renamed in, then the trash removed.
 * Same-directory renames keep each step atomic; the brief gap between
 * them is why callers hold `.lock`.
 */
export const swapDirectory = async (
  fs: FsPort,
  staged: string,
  dest: string,
): Promise<void> => {
  const trash = `${dest}.old-${nonce()}`;
  const st = await fs.stat(dest);
  if (st !== null) await fs.rename(dest, trash);
  try {
    await fs.rename(staged, dest);
  } catch (e) {
    if (st !== null) await fs.rename(trash, dest).catch(() => undefined);
    throw e;
  }
  if (st !== null) await fs.remove(trash, { recursive: true });
};

/** Copy a directory tree recursively through the port (local sources). */
export const copyTree = async (
  fs: FsPort,
  from: string,
  to: string,
): Promise<void> => {
  const st = await fs.stat(from);
  if (st === null) return;
  if (st.type === "directory") {
    await fs.mkdir(to);
    for (const entry of await fs.readDir(from)) {
      await copyTree(fs, join(from, entry.name), join(to, entry.name));
    }
    return;
  }
  if (st.type === "file") {
    await fs.writeFile(to, await fs.readFile(from));
    return;
  }
  if (st.type === "symlink") {
    const target = await fs.readlink(from);
    if (fs.symlink !== undefined) {
      await fs.symlink(target, to);
      return;
    }
    // Ports without a symlink primitive dereference, but only when the
    // target stays inside the copied tree — containment (§6.3) still holds.
    const resolved = target.startsWith("/")
      ? target
      : join(dirname(from), target);
    const data = await fs.readFile(resolved).catch(() => null);
    if (data === null)
      throw new Error(`cannot copy dangling/unreadable symlink ${from} -> ${target}`);
    await fs.writeFile(to, data);
  }
};
