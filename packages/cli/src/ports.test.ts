import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createExecPort } from "./ports/exec.js";
import { createFsPort } from "./ports/fs.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "harness-cli-ports-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const text = (b: Uint8Array) => new TextDecoder().decode(b);
const bytes = (s: string) => new TextEncoder().encode(s);

describe("ExecPort", () => {
  const exec = createExecPort();

  it("run spawns one token + argv (no shell)", async () => {
    const res = await exec.run("echo", ["hello"]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe("hello");
  });

  it("run surfaces non-zero exits as results, not throws", async () => {
    const res = await exec.run("false");
    expect(res.code).not.toBe(0);
  });

  it("the git binary is reachable (island rule: git via exec)", async () => {
    const res = await exec.run("git", ["--version"]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("git version");
  });

  it("run honors cwd", async () => {
    const res = await exec.run("pwd", [], { cwd: dir });
    expect(res.stdout.trim()).toBe(dir);
  });
});

describe("FsPort", () => {
  const exec = createExecPort();
  const fs = createFsPort(exec);

  it("writes bytes and reads back", async () => {
    const p = join(dir, "a", "b.txt");
    await fs.writeFile(p, bytes("hello"));
    expect(text(await fs.readFile(p))).toBe("hello");
    const s = await stat(p);
    expect(s.isFile()).toBe(true);
  });

  it("appendFile appends", async () => {
    const p = join(dir, "log.txt");
    await fs.appendFile(p, bytes("one\n"));
    await fs.appendFile(p, bytes("two\n"));
    expect(text(await fs.readFile(p))).toBe("one\ntwo\n");
  });

  it("stat returns null on missing; readDir lists dirents", async () => {
    const sub = join(dir, "pkg");
    expect(await fs.stat(sub)).toBeNull();
    await fs.mkdir(sub);
    await fs.writeFile(join(sub, "plugin.json"), bytes("{}"));
    expect((await fs.stat(sub))?.type).toBe("directory");
    expect((await fs.stat(join(sub, "plugin.json")))?.type).toBe("file");
    expect(await fs.readDir(sub)).toEqual([
      { name: "plugin.json", type: "file" },
    ]);
    await fs.remove(sub);
    expect(await fs.stat(sub)).toBeNull();
  });

  it("createExclusive wins once then yields", async () => {
    const p = join(dir, ".lock");
    expect(await fs.createExclusive(p, bytes("x"))).toBe(true);
    expect(await fs.createExclusive(p, bytes("y"))).toBe(false);
    expect(text(await fs.readFile(p))).toBe("x");
  });

  it("errors carry a .code field the store can inspect", async () => {
    await expect(fs.readFile(join(dir, "nope"))).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("symlink via ln creates a real link", async () => {
    const target = join(dir, "target.txt");
    const link = join(dir, "link.txt");
    await fs.writeFile(target, bytes("x"));
    await fs.symlink!(target, link);
    expect(await fs.readlink(link)).toBe(target);
    expect(await readFile(link, "utf8")).toBe("x");
  });
});
