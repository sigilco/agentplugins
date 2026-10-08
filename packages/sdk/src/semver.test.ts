import { describe, expect, it } from "vitest";
import { compareVersions, parseVersion, satisfiesRange } from "./semver.js";

describe("semver subset", () => {
  it("parseVersion", () => {
    expect(parseVersion("1.2.3")).toMatchObject({ major: 1, minor: 2, patch: 3 });
    expect(parseVersion("v1.2")).toBeTruthy();
    expect(parseVersion("bad")).toBeNull();
  });

  it("compareVersions", () => {
    const v = (s: string) => {
      const p = parseVersion(s);
      expect(p).toBeTruthy();
      return p!;
    };
    expect(compareVersions(v("1.0.0"), v("1.0.1")) < 0).toBe(true);
    expect(compareVersions(v("2.0.0"), v("1.9.9")) > 0).toBe(true);
    expect(compareVersions(v("1.0.0"), v("1.0.0"))).toBe(0);
    expect(compareVersions(v("1.0.0-alpha"), v("1.0.0")) < 0).toBe(true);
  });

  it("ranges", () => {
    expect(satisfiesRange("1.2.3", "*")).toBe(true);
    expect(satisfiesRange("1.2.3", "^1.0.0")).toBe(true);
    expect(satisfiesRange("2.0.0", "^1.0.0")).toBe(false);
    expect(satisfiesRange("1.2.3", "~1.2.0")).toBe(true);
    expect(satisfiesRange("1.3.0", "~1.2.0")).toBe(false);
    expect(satisfiesRange("1.2.3", "1.2.x")).toBe(true);
    expect(satisfiesRange("1.2.3", ">=1.0.0 <2.0.0")).toBe(true);
    expect(satisfiesRange("1.2.3", "1.0.0 - 2.0.0")).toBe(true);
    expect(satisfiesRange("1.2.3", "2.x || 1.x")).toBe(true);
    expect(satisfiesRange("1.2.3", "=1.2.3")).toBe(true);
  });
});
