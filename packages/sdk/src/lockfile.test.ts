import { describe, expect, it } from "vitest";
import { computeIntegrity, listPackageFiles } from "./integrity.js";
import { readLockfile, readLockfileText, serializeLockfile } from "./lockfile.js";
import type { LockEntry, Lockfile } from "./types.js";
import { createMemFs } from "./testing.js";

const entry = (over: Partial<LockEntry> = {}): LockEntry => ({
  kind: "plugin",
  manifest: { name: "demo", version: "1.0.0" },
  source: { type: "local", uri: "./demo" },
  integrity: "sha256-AAA",
  installedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  targets: [],
  ...over,
});

describe("lockfile", () => {
  it("serialize: sorted keys + 2-space JSON", () => {
    const lock: Lockfile = {
      version: 1,
      extensions: { zeta: entry(), alpha: entry({ manifest: { name: "alpha", version: "0.1.0" } }) },
    };
    const text = serializeLockfile(lock);
    expect(text.indexOf('"alpha"')).toBeLessThan(text.indexOf('"zeta"'));
    expect(text).toContain('  "version": 1');
    expect(readLockfileText(text).lockfile.extensions["alpha"]).toBeTruthy();
  });

  it("missing file → empty; corrupt → flagged, content preserved", async () => {
    const fs = createMemFs();
    expect((await readLockfile(fs, "/store/extensions.lock")).lockfile.extensions).toEqual({});
    fs.putFile("/store/extensions.lock", "{not json!!");
    const res = await readLockfile(fs, "/store/extensions.lock");
    expect(res.corrupt).toBeTruthy();
    expect(res.lockfile.extensions).toEqual({});
  });

  it("version>1 refuses", () => {
    expect(() => readLockfileText(JSON.stringify({ version: 2, extensions: {} }))).toThrow();
  });

  it("unknown fields on entries survive a roundtrip (forward-compat)", () => {
    const e = { ...entry(), futureField: { a: 1 } };
    const text = serializeLockfile({ version: 1, extensions: { demo: e } });
    const back = readLockfileText(text);
    expect((back.lockfile.extensions["demo"] as Record<string, unknown>)["futureField"]).toEqual({ a: 1 });
  });
});

describe("computeIntegrity (lockfile §4 SRI)", () => {
  it("hashes sorted <hex>␣␣<path> lines and is stable", async () => {
    const fs = createMemFs();
    fs.putFile("/pkg/plugin.json", "{}");
    fs.putFile("/pkg/a.txt", "hello");
    fs.putFile("/pkg/sub/b.txt", "world");
    const sri1 = await computeIntegrity(fs, "/pkg");
    const sri2 = await computeIntegrity(fs, "/pkg");
    expect(sri1).toBe(sri2);
    expect(sri1.startsWith("sha256-")).toBe(true);
    const files = await listPackageFiles(fs, "/pkg");
    expect(files.map((f) => f.path)).toEqual([...files.map((f) => f.path)].sort());
  });

  it("changes when contents change", async () => {
    const fs = createMemFs();
    fs.putFile("/pkg/a.txt", "v1");
    const a = await computeIntegrity(fs, "/pkg");
    fs.putFile("/pkg/a.txt", "v2");
    expect(await computeIntegrity(fs, "/pkg")).not.toBe(a);
  });

  it("symlink hashes the target string; dangling aborts", async () => {
    const fs = createMemFs();
    fs.putFile("/pkg/a.txt", "x");
    fs.putSymlink("/pkg/link", "a.txt");
    const ok = await computeIntegrity(fs, "/pkg");
    expect(ok).toMatch(/^sha256-/);
    fs.putSymlink("/pkg/dangling", "missing");
    await expect(computeIntegrity(fs, "/pkg")).rejects.toMatchObject({ kind: "trust-violation" });
  });
});
