import { describe, expect, it } from "vitest";
import { cloneUrlFor, resolveSource } from "./sources.js";

describe("resolveSource", () => {
  it("parses explicit schemes", () => {
    expect(resolveSource("git:https://x/y.git").type).toBe("git");
    expect(resolveSource("github:owner/repo").type).toBe("github");
    expect(resolveSource("gh:owner/repo").type).toBe("github");
    expect(resolveSource("registry:foo@1.2.3").type).toBe("registry");
  });

  it("parses https URLs incl. github tree/subdir", () => {
    const s = resolveSource("https://github.com/owner/repo/tree/main/sub/dir");
    expect(s.type).toBe("github");
    expect(s.uri).toBe("owner/repo");
    expect(s.path).toBe("sub/dir");
    expect(s.ref).toBe("main");

    const plain = resolveSource("https://github.com/owner/repo");
    expect(plain.type).toBe("github");
    expect(plain.uri).toBe("owner/repo");
  });

  it("parses scp-style git@github.com → github", () => {
    const s = resolveSource("git@github.com:owner/repo.git");
    expect(s.type).toBe("github");
    expect(s.uri).toBe("owner/repo");
    expect(cloneUrlFor(s)).toBe("https://github.com/owner/repo.git");
    const other = resolveSource("git@gitlab.com:owner/repo.git");
    expect(other.type).toBe("git");
  });

  it("owner/repo shorthand → github", () => {
    const s = resolveSource("owner/repo/subdir");
    expect(s.type).toBe("github");
    expect(s.uri).toBe("owner/repo");
    expect(s.path).toBe("subdir");
  });

  it("local path forms → local", () => {
    for (const p of ["./pkg", "../pkg", "/abs/path", "~/pkg", "local:./x"]) {
      const s = resolveSource(p);
      expect(s.type).toBe("local");
    }
  });

  it("bare name[@ver] → registry", () => {
    const s = resolveSource("my-plugin@2.0.0");
    expect(s.type).toBe("registry");
    expect(s.uri).toBe("my-plugin");
    expect(s.ref).toBe("2.0.0");
    expect(resolveSource("my-plugin").type).toBe("registry");
  });

  it("cloneUrlFor github → https .git", () => {
    expect(cloneUrlFor(resolveSource("gh:o/r"))).toBe("https://github.com/o/r.git");
  });

  it("rejects garbage", () => {
    expect(() => resolveSource("")).toThrow();
  });
});
