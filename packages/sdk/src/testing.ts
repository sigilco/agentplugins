/**
 * In-memory StorePorts fakes for tests (and cli previews). Everything is
 * a Map keyed by normalized path; symlinks are first-class so integrity
 * and materialization tests exercise the real code paths.
 */

import { FsError } from "./ports.js";
import type {
  ExecOptions,
  ExecPort,
  ExecResult,
  FsDirent,
  FsPort,
  FsStat,
} from "./ports.js";
import { normalize } from "./path.js";
import type { StorePorts } from "./ports.js";

type Node =
  | { type: "directory"; children: Set<string> }
  | { type: "file"; data: Uint8Array; mode: "0644" | "0755"; mtime: number }
  | { type: "symlink"; target: string };

export interface MemFs extends FsPort {
  /** Test helpers — not part of FsPort. */
  putFile(path: string, content: string | Uint8Array): void;
  putSymlink(path: string, target: string): void;
  tree(): string[];
  clock: { now: number };
}

const enc = new TextEncoder();

const parentOf = (p: string): string => {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
};
const leafOf = (p: string): string => p.slice(p.lastIndexOf("/") + 1);

export const createMemFs = (): MemFs => {
  const nodes = new Map<string, Node>();
  const clock = { now: 1_000_000 };
  nodes.set("/", { type: "directory", children: new Set() });

  const get = (path: string): Node => {
    const n = nodes.get(normalize(path));
    if (n === undefined) throw new FsError("not-found", path);
    return n;
  };
  const getDir = (path: string): Set<string> => {
    const n = get(path);
    if (n.type !== "directory") throw new FsError("not-directory", path);
    return n.children;
  };
  const ensureDirChain = (path: string): void => {
    const parts = normalize(path).split("/").filter(Boolean);
    let cur = "";
    for (const part of parts) {
      cur += `/${part}`;
      const existing = nodes.get(cur);
      if (existing) {
        if (existing.type !== "directory") throw new FsError("io", cur, `mkdir on non-dir: ${cur}`);
      } else {
        nodes.set(cur, { type: "directory", children: new Set() });
        (nodes.get(parentOf(cur)) as Extract<Node, { type: "directory" }>).children.add(part);
      }
    }
  };
  const rmNode = (path: string): void => {
    const n = get(path);
    if (n.type === "directory")
      for (const c of [...n.children]) rmNode(`${path}/${c}`);
    const parent = nodes.get(parentOf(path));
    if (parent?.type === "directory") parent.children.delete(leafOf(path));
    nodes.delete(path);
  };

  const fs: MemFs = {
    clock,
    async readFile(path) {
      const n = get(path);
      if (n.type === "file") return n.data;
      if (n.type === "symlink") {
        const resolved = normalize(n.target.startsWith("/") ? n.target : `${parentOf(path)}/${n.target}`);
        const t = nodes.get(resolved);
        if (t?.type === "file") return t.data;
        throw new FsError("not-found", resolved);
      }
      throw new FsError("io", path, `not a file: ${path}`);
    },
    async writeFile(path, data) {
      const p = normalize(path);
      getDir(parentOf(p));
      const dataBuf = typeof data === "string" ? enc.encode(data) : data;
      nodes.set(p, { type: "file", data: dataBuf, mode: "0644", mtime: clock.now++ });
      getDir(parentOf(p)).add(leafOf(p));
    },
    async appendFile(path, data) {
      const buf = typeof data === "string" ? enc.encode(data) : data;
      try {
        const cur = await fs.readFile(path);
        const merged = new Uint8Array(cur.length + buf.length);
        merged.set(cur);
        merged.set(buf, cur.length);
        await fs.writeFile(path, merged);
      } catch {
        await fs.writeFile(path, buf);
      }
    },
    async mkdir(path) {
      ensureDirChain(path);
    },
    async rename(from, to) {
      const f = normalize(from);
      const t = normalize(to);
      const node = get(f);
      getDir(parentOf(t));
      // If destination exists as a dir, refuse (POSIX would rename inside).
      const dst = nodes.get(t);
      if (dst?.type === "directory") throw new FsError("io", t, `rename target is a dir: ${t}`);
      // Move subtree.
      if (node.type === "directory") {
        const subtree = [...nodes.keys()].filter((k) => k === f || k.startsWith(`${f}/`));
        for (const k of subtree) {
          const node2 = nodes.get(k)!;
          nodes.delete(k);
          nodes.set(k === f ? t : `${t}${k.slice(f.length)}`, node2);
        }
      } else {
        nodes.delete(f);
        nodes.set(t, node);
      }
      (nodes.get(parentOf(f)) as Extract<Node, { type: "directory" }>).children.delete(leafOf(f));
      getDir(parentOf(t)).add(leafOf(t));
    },
    async remove(path, _opts) {
      const p = normalize(path);
      if (!nodes.has(p)) return; // spec: missing paths succeed silently
      rmNode(p);
    },
    async stat(path) {
      const n = nodes.get(normalize(path));
      return n === undefined ? null : statOf(n);
    },
    async readDir(path): Promise<FsDirent[]> {
      const children = getDir(path);
      const out: FsDirent[] = [];
      for (const name of children) {
        const child = nodes.get(`${normalize(path)}/${name}`)!;
        out.push({ name, type: child.type === "directory" ? "directory" : child.type === "symlink" ? "symlink" : "file" });
      }
      return out;
    },
    async readlink(path) {
      const n = get(path);
      if (n.type !== "symlink") throw new FsError("io", path, `not a symlink: ${path}`);
      return n.target;
    },
    async createExclusive(path, data) {
      const p = normalize(path);
      if (nodes.has(p)) return false;
      await fs.writeFile(p, data);
      return true;
    },
    async symlink(target, linkPath) {
      const p = normalize(linkPath);
      getDir(parentOf(p));
      nodes.set(p, { type: "symlink", target });
      getDir(parentOf(p)).add(leafOf(p));
    },
    putFile(path, content) {
      const p = normalize(path);
      ensureDirChain(parentOf(p));
      nodes.set(p, {
        type: "file",
        data: typeof content === "string" ? enc.encode(content) : content,
        mode: "0644",
        mtime: clock.now++,
      });
      getDir(parentOf(p)).add(leafOf(p));
    },
    putSymlink(path, target) {
      const p = normalize(path);
      ensureDirChain(parentOf(p));
      nodes.set(p, { type: "symlink", target });
      getDir(parentOf(p)).add(leafOf(p));
    },
    tree() {
      return [...nodes.keys()].sort();
    },
  };

  const statOf = (n: Node): FsStat =>
    n.type === "file"
      ? { type: "file", size: n.data.length, mtimeMs: n.mtime }
      : n.type === "directory"
        ? { type: "directory", size: 0, mtimeMs: 0 }
        : { type: "symlink", size: n.target.length, mtimeMs: 0 };

  return fs;
};

/* ------------------------------ exec fake --------------------------- */

export type FakeExecHandler = (
  cmd: string,
  args: string[],
  opts: ExecOptions,
) => Promise<ExecResult> | ExecResult;

export interface MemExec extends ExecPort {
  /** Recorded invocations (deep-ish copies). */
  calls: { cmd: string; args: string[]; opts: ExecOptions }[];
  /** Route a command by prefix: `handler.set("git", fn)` or fixed result. */
  handler: Map<string, FakeExecHandler | ExecResult>;
}

export const createMemExec = (): MemExec => {
  const calls: MemExec["calls"] = [];
  const handler = new Map<string, FakeExecHandler | ExecResult>();
  const exec: MemExec = {
    calls,
    handler,
    async run(cmd, args, opts = {}) {
      calls.push({ cmd, args: [...(args ?? [])], opts });
      const key = [...handler.keys()].find(
        (k) => cmd === k || cmd.endsWith(`/${k}`) || cmd.startsWith(`${k} `),
      );
      const h = key === undefined ? undefined : handler.get(key);
      if (h === undefined) return { code: 0, stdout: "", stderr: "" };
      if (typeof h === "function") return h(cmd, [...(args ?? [])], opts);
      return h;
    },
  };
  return exec;
};

export const createTestPorts = (): StorePorts & { fs: MemFs; exec: MemExec } => ({
  fs: createMemFs(),
  exec: createMemExec(),
});
