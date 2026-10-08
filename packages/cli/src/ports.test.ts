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

describe("ExecPort", () => {
  const exec = createExecPort();

  it("exec runs one token + argv (no shell)", async () => {
    const res = await exec.exec("echo", ["hello"]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe("hello");
  });

  it("exec surfaces non-zero exits as results, not throws", async () => {
    const res = await exec.exec("false");
    expect(res.code).not.toBe(0);
  });

  it("the git binary is reachable (island rule: git via exec)", async () => {
    const res = await exec.exec("git", ["--version"]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("git version");
  });

  it("run honors cwd", async () => {
    const res = await exec.run("pwd", { cwd: dir });
    expect(res.stdout.trim()).toBe(dir);
  });
});

describe("FsPort", () => {
  const exec = createExecPort();
  const fs = createFsPort(exec);

  it("writes atomically and reads back", async () => {
    const p = join(dir, "a", "b.txt");
    await fs.writeFile(p, "hello");
    expect(await fs.readFile(p)).toBe("hello");
    const s = await stat(p);
    expect(s.isFile()).toBe(true);
  });

  it("appendFile appends", async () => {
    const p = join(dir, "log.txt");
    await fs.appendFile(p, "one\n");
    await fs.appendFile(p, "two\n");
    expect(await fs.readFile(p)).toBe("one\ntwo\n");
  });

  it("exists/stat/list/mkdir/remove", async () => {
    const sub = join(dir, "pkg");
    expect(await fs.exists(sub)).toBe(false);
    await fs.mkdir(sub);
    await fs.writeFile(join(sub, "plugin.json"), "{}");
    expect(await fs.exists(sub)).toBe(true);
    expect((await fs.stat(sub)).kind).toBe("directory");
    expect((await fs.stat(join(sub, "plugin.json"))).kind).toBe("file");
    expect(await fs.list(sub)).toEqual(["plugin.json"]);
    await fs.remove(sub);
    expect(await fs.exists(sub)).toBe(false);
  });

  it("symlink via ln creates a real link; copy is the fallback", async () => {
    const target = join(dir, "target.txt");
    const link = join(dir, "link.txt");
    await fs.writeFile(target, "x");
    await fs.symlink!(target, link);
    expect(await fs.readlink!(link)).toBe(target);
    expect(await readFile(link, "utf8")).toBe("x");
    const copied = join(dir, "copied.txt");
    await fs.copy(target, copied);
    expect(await fs.readFile(copied)).toBe("x");
  });
});
