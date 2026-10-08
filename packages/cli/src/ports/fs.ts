/**
 * Node FsPort — the fs implementation the cli injects into the sdk store
 * (canonical shape: `packages/sdk/src/ports.ts`). Atomicity primitives the
 * store relies on: `rename` for staged writes, `createExclusive` for the
 * `.lock` mutex (store-layout.md §7). `symlink` goes through `ln` with the
 * caller's copy fallback per the scriptc-island rule (AGENTS.md §7).
 *
 * Errors are thrown with a `.code` field matching sdk `FsError.code` —
 * the store inspects `.code` (never `instanceof`), so a local class keeps
 * `sdk-bind.ts` the only runtime importer.
 */
import {
  appendFile as fsAppendFile,
  lstat,
  mkdir as fsMkdir,
  readFile as fsReadFile,
  readdir,
  readlink as fsReadlink,
  rename as fsRename,
  rm,
  writeFile as fsWriteFile,
} from "node:fs/promises";
import { dirname } from "node:path";

import type {
  ExecPort,
  FsDirent,
  FsPort,
  FsStat,
} from "../api.js";

type FsCode =
  | "not-found"
  | "exists"
  | "not-directory"
  | "is-directory"
  | "not-empty"
  | "io";

/** FsError-shaped error (sdk ports.ts): the store keys on `.code` only. */
class PortFsError extends Error {
  readonly code: FsCode;
  readonly path: string;
  constructor(code: FsCode, path: string, message?: string) {
    super(message ?? `${code}: ${path}`);
    this.name = "FsError";
    this.code = code;
    this.path = path;
  }
}

const codeOf = (err: unknown): FsCode => {
  const c = (err as { code?: string }).code;
  switch (c) {
    case "ENOENT":
      return "not-found";
    case "EEXIST":
      return "exists";
    case "ENOTDIR":
      return "not-directory";
    case "EISDIR":
      return "is-directory";
    case "ENOTEMPTY":
      return "not-empty";
    default:
      return "io";
  }
};

const wrap = async <T>(path: string, op: () => Promise<T>): Promise<T> => {
  try {
    return await op();
  } catch (err) {
    if (err instanceof PortFsError) throw err;
    throw new PortFsError(codeOf(err), path, (err as Error).message);
  }
};

const typeOf = (mode: {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}): FsStat["type"] => {
  if (mode.isSymbolicLink()) return "symlink";
  if (mode.isFile()) return "file";
  if (mode.isDirectory()) return "directory";
  return "other";
};

export const createFsPort = (exec: ExecPort): FsPort => ({
  readFile: (path) => wrap(path, async () => new Uint8Array(await fsReadFile(path))),

  writeFile: (path, data) =>
    wrap(path, async () => {
      await fsMkdir(dirname(path), { recursive: true });
      await fsWriteFile(path, data);
    }),

  mkdir: (path) => wrap(path, () => fsMkdir(path, { recursive: true }).then(() => undefined)),

  rename: (from, to) =>
    wrap(from, async () => {
      await fsMkdir(dirname(to), { recursive: true });
      await fsRename(from, to);
    }),

  remove: (path, opts) =>
    wrap(path, () => rm(path, { recursive: opts?.recursive ?? true, force: true })),

  // lstat + null-on-missing (the store distinguishes absent from error).
  stat: (path) =>
    wrap(path, async () => {
      try {
        const s = await lstat(path);
        return { type: typeOf(s), size: s.size, mtimeMs: s.mtimeMs };
      } catch (err) {
        if (codeOf(err) === "not-found") return null;
        throw err;
      }
    }),

  readDir: (path) =>
    wrap(path, async () => {
      const entries = await readdir(path, { withFileTypes: true });
      const out: FsDirent[] = entries.map((e) => ({
        name: e.name,
        type: typeOf(e),
      }));
      return out;
    }),

  readlink: (path) => wrap(path, () => fsReadlink(path)),

  // O_EXCL mutex primitive — returns whether it won the create.
  createExclusive: (path, data) =>
    wrap(path, async () => {
      try {
        await fsMkdir(dirname(path), { recursive: true });
        await fsWriteFile(path, data, { flag: "wx" });
        return true;
      } catch (err) {
        if (codeOf(err) === "exists") return false;
        throw err;
      }
    }),

  appendFile: (path, data) => wrap(path, () => fsAppendFile(path, data)),

  // `ln -s` via exec — no fs.symlink on the island. Failure (no `ln`,
  // restricted fs) is left for the caller's copy fallback.
  symlink: async (target, path) => {
    const res = await exec.run("ln", ["-s", target, path]);
    if (res.code !== 0) {
      throw new PortFsError(
        "io",
        path,
        `ln -s failed (${res.code}): ${res.stderr.trim()}`,
      );
    }
  },
});
