/** In-memory FsPort for tests — flat map of path → content (sdk shape). */
import type { FsDirent, FsPort, FsStat } from "../api.js";

class MemFsError extends Error {
  readonly code = "not-found";
  readonly path: string;
  constructor(path: string) {
    super(`not found: ${path}`);
    this.name = "FsError";
    this.path = path;
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export const createMemoryFs = (
  seed: Record<string, string> = {},
): FsPort & { files: Map<string, string> } => {
  const files = new Map<string, string>(Object.entries(seed));
  const dirs = new Set<string>();

  const parentDirs = (path: string): string[] => {
    const parts = path.split("/").filter(Boolean);
    const out: string[] = [];
    for (let i = 1; i < parts.length; i += 1) {
      out.push(`/${parts.slice(0, i).join("/")}`);
    }
    return out;
  };
  const prefixOf = (path: string) => (path.endsWith("/") ? path : `${path}/`);

  const fs: FsPort & { files: Map<string, string> } = {
    files,
    readFile: async (path) => {
      const v = files.get(path);
      if (v === undefined) throw new MemFsError(path);
      return enc.encode(v);
    },
    writeFile: async (path, data) => {
      for (const d of parentDirs(path)) dirs.add(d);
      files.set(path, dec.decode(data));
    },
    appendFile: async (path, data) => {
      files.set(path, (files.get(path) ?? "") + dec.decode(data));
    },
    stat: async (path): Promise<FsStat | null> => {
      if (files.has(path)) {
        return { type: "file", size: files.get(path)!.length, mtimeMs: 0 };
      }
      if (dirs.has(path)) return { type: "directory", size: 0, mtimeMs: 0 };
      return null;
    },
    readDir: async (path): Promise<FsDirent[]> => {
      const prefix = prefixOf(path);
      const seen = new Map<string, FsDirent["type"]>();
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          const name = rest.split("/")[0];
          seen.set(name, rest.includes("/") ? "directory" : "file");
        }
      }
      return [...seen.entries()].map(([name, type]) => ({ name, type }));
    },
    mkdir: async (path) => {
      dirs.add(path);
    },
    remove: async (path, opts) => {
      files.delete(path);
      dirs.delete(path);
      if (opts?.recursive === false) return;
      const prefix = prefixOf(path);
      for (const key of [...files.keys()]) {
        if (key.startsWith(prefix)) files.delete(key);
      }
      for (const d of [...dirs]) {
        if (d.startsWith(prefix)) dirs.delete(d);
      }
    },
    rename: async (from, to) => {
      const v = files.get(from);
      if (v === undefined) throw new MemFsError(from);
      files.delete(from);
      files.set(to, v);
    },
    readlink: async (path) => {
      const v = files.get(path);
      if (v === undefined) throw new MemFsError(path);
      return v;
    },
    createExclusive: async (path, data) => {
      if (files.has(path) || dirs.has(path)) return false;
      files.set(path, dec.decode(data));
      return true;
    },
  };
  return fs;
};
