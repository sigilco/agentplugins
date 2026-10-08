import { describe, expect, it } from "vitest";
import {
  DEFAULT_POLICY,
  loadPolicy,
  parsePolicyText,
  resolveExecDecision,
  sourceAllowed,
  sourceAllowlisted,
} from "./policy.js";
import { resolveSource } from "./sources.js";
import { createMemFs } from "./testing.js";

describe("trust policy", () => {
  it("defaults match spec §4.1 — ask for interactive exec, deny nonInteractive, empty lists", () => {
    const p = DEFAULT_POLICY;
    expect(p.exec.setup).toBe("ask");
    expect(p.exec.hooks).toBe("ask");
    expect(p.exec.mcp).toBe("ask");
    expect(p.exec.skillScripts).toBe("ask");
    expect(p.exec.nonInteractive).toBe("deny");
    expect(p.sources.allow).toEqual([]);
    expect(p.sources.deny).toEqual([]);
  });

  it("deny list beats allow list; empty allow = unrestricted", () => {
    const p = {
      ...DEFAULT_POLICY,
      sources: { allow: ["trusted/*"], deny: ["evil/**"] },
    };
    expect(sourceAllowed(p, resolveSource("github:evil/x"))).toBe(false);
    expect(sourceAllowed(p, resolveSource("gh:trusted/pkg"))).toBe(true);
    expect(sourceAllowed(DEFAULT_POLICY, resolveSource("github:anything/ok"))).toBe(true);
  });

  it("agent ask → deny unless source allowlisted; user ask → ask", () => {
    const src = resolveSource("github:some/pkg");
    const p = { ...DEFAULT_POLICY, sources: { allow: ["some/*"], deny: [] } };
    expect(resolveExecDecision(DEFAULT_POLICY, "setup", "user", src)).toBe("ask");
    expect(resolveExecDecision(DEFAULT_POLICY, "setup", "agent", src)).toBe("deny");
    expect(resolveExecDecision(p, "setup", "agent", src)).toBe("ask");
    expect(sourceAllowlisted(p, src)).toBe(true);
  });

  it("non-user + nonInteractive=deny resolves ask → deny for unattended", () => {
    expect(resolveExecDecision(DEFAULT_POLICY, "setup", "daemon", resolveSource("local:/tmp/x")))
      .toBe("deny");
  });

  it("parses config.toml [policy] + reports syntax errors", async () => {
    const fs = createMemFs();
    const read = await loadPolicy(fs, "/store/config.toml");
    expect(read.policy).toEqual(DEFAULT_POLICY);
    const r = parsePolicyText(`
[policy.exec]
hooks = "deny"
nonInteractive = "allow"
[policy.sources]
allow = ["ok/**"]
`);
    expect(r.policy.exec.hooks).toBe("deny");
    expect(r.policy.exec.nonInteractive).toBe("allow");
    expect(r.policy.sources.allow).toEqual(["ok/**"]);
    const bad = parsePolicyText("[unterminated");
    expect(bad.corrupt).toBeTruthy();
  });
});
