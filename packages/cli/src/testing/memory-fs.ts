/** In-memory FsPort for tests — flat map of path → content. */
import type { FsPort } from "../api.js";

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

  const fs: FsPort & { files: Map<string, string> } = {
    files,
    readFile: async (path) => {
      const v = files.get(path);
      if (v === undefined) throw new Error(`not found: ${path}`);
      return v;
    },
    readFileBytes: async (path) => {
      const v = files.get(path);
      if (v === undefined) throw new Error(`not found: ${path}`);
      return new TextEncoder().encode(v);
    },
    writeFile: async (path, data) => {
      for (const d of parentDirs(path)) dirs.add(d);
      files.set(path, typeof data === "string" ? data : new TextDecoder().decode(data));
    },
    appendFile: async (path, data) => {
      files.set(path, (files.get(path) ?? "") + data);
    },
    exists: async (path) => files.has(path) || dirs.has(path),
    stat: async (path) => {
      if (files.has(path)) {
        return { kind: "file", size: files.get(path)!.length, mtimeMs: 0 };
      }
      if (dirs.has(path)) return { kind: "directory", size: 0, mtimeMs: 0 };
      throw new Error(`not found: ${path}`);
    },
    list: async (path) => {
      const prefix = path.endsWith("/") ? path : `${path}/`;
      const names = new Set<string>();
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) {
          names.add(key.slice(prefix.length).split("/")[0]);
        }
      }
      return [...names];
    },
    mkdir: async (path) => {
      dirs.add(path);
    },
    remove: async (path) => {
      files.delete(path);
      dirs.delete(path);
      const prefix = `${path}/`;
      for (const key of [...files.keys()]) {
        if (key.startsWith(prefix)) files.delete(key);
      }
      for (const d of [...dirs]) {
        if (d.startsWith(prefix)) dirs.delete(d);
      }
    },
    rename: async (from, to) => {
      const v = files.get(from);
      if (v === undefined) throw new Error(`not found: ${from}`);
      files.delete(from);
      files.set(to, v);
    },
    copy: async (from, to) => {
      const v = files.get(from);
      if (v === undefined) throw new Error(`not found: ${from}`);
      files.set(to, v);
    },
  };
  return fs;
};
