import { describe, expect, it } from "vitest";

import {
  assertNoUnknownFlags,
  flagBool,
  flagEnum,
  flagString,
  parseArgs,
} from "./args.js";
import { CliError } from "./errors.js";

describe("parseArgs", () => {
  it("collects positionals and boolean flags", () => {
    const a = parseArgs(["add", "owner/repo", "-y", "--json"]);
    expect(a.positionals).toEqual(["add", "owner/repo"]);
    expect(a.flags.y).toBe(true);
    expect(a.flags.json).toBe(true);
  });

  it("parses --key value and --key=value", () => {
    const a = parseArgs(["--skill-target", "store", "--limit=10"]);
    expect(a.flags["skill-target"]).toBe("store");
    expect(a.flags.limit).toBe("10");
  });

  it("treats --no-x as false", () => {
    expect(parseArgs(["--no-json"]).flags.json).toBe(false);
  });

  it("honors the -- separator", () => {
    const a = parseArgs(["remove", "--", "--weird-name"]);
    expect(a.positionals).toEqual(["remove", "--weird-name"]);
  });

  it("bundles short boolean flags", () => {
    const a = parseArgs(["-y"]);
    expect(a.flags.y).toBe(true);
  });
});

describe("flag helpers", () => {
  it("flagEnum rejects bad values with a usage error", () => {
    expect(() =>
      flagEnum({ f: "bogus" }, "f", ["shared", "store"] as const),
    ).toThrow(CliError);
    expect(flagEnum({ f: "store" }, "f", ["shared", "store"] as const)).toBe(
      "store",
    );
  });

  it("flagString picks first defined", () => {
    expect(flagString({ a: "x" }, "missing", "a")).toBe("x");
    expect(flagString({ a: true }, "a")).toBeUndefined();
  });

  it("assertNoUnknownFlags throws on typos", () => {
    expect(() =>
      assertNoUnknownFlags({ json: true, jsno: true }, ["json"]),
    ).toThrow(CliError);
  });

  it("flagBool finds aliases", () => {
    expect(flagBool({ yes: true }, "y", "yes")).toBe(true);
    expect(flagBool({}, "y", "yes")).toBe(false);
  });
});
