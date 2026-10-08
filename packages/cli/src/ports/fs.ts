/**
 * Node FsPort — the only fs implementation the cli injects into the sdk
 * store. Writes are atomic (sibling temp + rename, store-layout.md §7.1);
 * symlink goes through `ln` with a copy fallback per the scriptc-island
 * rule (no `symlinkSync` — AGENTS.md §7).
 */
import {
  appendFile as fsAppendFile,
  copyFile,
  cp,
  lstat,
  mkdir as fsMkdir,
  readFile as fsReadFile,
  readdir,
  readlink as fsReadlink,
  rename as fsRename,
  rm,
  stat as fsStat,
  writeFile as fsWriteFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

import type { ExecPort, FsPort } from "../api.js";

const kindOf = (mode: {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}): "file" | "directory" | "symlink" | "other" => {
  if (mode.isSymbolicLink()) return "symlink";
  if (mode.isFile()) return "file";
  if (mode.isDirectory()) return "directory";
  return "other";
};

export const createFsPort = (exec: ExecPort): FsPort => ({
  readFile: (path) => fsReadFile(path, "utf8"),

  readFileBytes: async (path) => new Uint8Array(await fsReadFile(path)),

  writeFile: async (path, data) => {
    // Atomic write: sibling temp + rename (store-layout.md §7.1).
    await fsMkdir(dirname(path), { recursive: true });
    const tmp = join(
      dirname(path),
      `.${randomBytes(6).toString("hex")}.tmp`,
    );
    try {
      await fsWriteFile(tmp, data);
      await fsRename(tmp, path);
    } catch (err) {
      await rm(tmp, { force: true }).catch(() => undefined);
      throw err;
    }
  },

  appendFile: (path, data) => fsAppendFile(path, data, "utf8"),

  exists: async (path) => {
    try {
      await fsStat(path);
      return true;
    } catch {
      return false;
    }
  },

  stat: async (path) => {
    const s = await lstat(path);
    return { kind: kindOf(s), size: s.size, mtimeMs: s.mtimeMs };
  },

  list: (path) => readdir(path),

  mkdir: async (path) => {
    await fsMkdir(path, { recursive: true });
  },

  remove: (path) => rm(path, { recursive: true, force: true }),

  rename: (from, to) => fsRename(from, to),

  symlink: async (target, path) => {
    // `ln -s` via exec — no fs.symlink on the island. Failure (no `ln`,
    // restricted fs) is left for the caller's copy fallback.
    const res = await exec.exec("ln", ["-s", target, path]);
    if (res.code !== 0) {
      throw new Error(`ln -s failed (${res.code}): ${res.stderr.trim()}`);
    }
  },

  readlink: (path) => fsReadlink(path),

  copy: async (from, to) => {
    const s = await lstat(from);
    if (s.isDirectory()) {
      await cp(from, to, { recursive: true });
    } else {
      await fsMkdir(dirname(to), { recursive: true });
      await copyFile(from, to);
    }
  },
});
