import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashDirectory, verifyIntegrity, formatIntegrity, parseIntegrity } from "../src/integrity";

let work: string;

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "sec-integrity-"));
  mkdirSync(join(work, "src"), { recursive: true });
  writeFileSync(join(work, "src", "a.txt"), "alpha");
  writeFileSync(join(work, "src", "b.txt"), "beta");
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe("integrity hashing", () => {
  it("produces a deterministic sha256: string", () => {
    const r = hashDirectory(work);
    expect(r.integrity).toMatch(/^sha256:[a-f0-9]{64}$/);
    const r2 = hashDirectory(work);
    expect(r2.integrity).toBe(r.integrity);
    expect(r.files).toBeGreaterThan(0);
  });

  it("formats and parses integrity strings round-trip", () => {
    const r = hashDirectory(work);
    const parsed = parseIntegrity(r.integrity);
    expect(parsed?.digest).toBe(r.digest);
    expect(formatIntegrity(r.digest)).toBe(r.integrity);
    expect(parseIntegrity("not-a-hash")).toBeNull();
  });

  it("verifyIntegrity matches when expected matches", () => {
    const r = hashDirectory(work);
    const v = verifyIntegrity(work, r.integrity);
    expect(v.match).toBe(true);
    expect(v.reason).toBeUndefined();
  });

  it("verifyIntegrity rejects malformed strings", () => {
    const v = verifyIntegrity(work, "nope");
    expect(v.match).toBe(false);
    expect(v.reason).toMatch(/not in the form/);
  });

  it("verifyIntegrity rejects mismatched digests", () => {
    const v = verifyIntegrity(work, `sha256:${"0".repeat(64)}`);
    expect(v.match).toBe(false);
    expect(v.reason).toMatch(/does not match/);
  });
});
