import { describe, expect, it } from "vitest";

import {
  callersFromToml,
  defaultPolicy,
  parseToml,
  policyFromToml,
  resolveExecDecision,
} from "./config.js";

const CONFIG = `
# trust + serve config
[policy]
exec.setup = "deny"
exec.hooks = "ask"
exec.mcp = "allow"
exec.skillScripts = "ask"
exec.nonInteractive = "deny"
sources.allow = ["acme/*", "github.com/trusted/repo"]
sources.deny = ["evil/*"]

[[serve.caller]]
name = "maki"
token = "ahrt_abc"
allow = ["extensions.list", "extensions.get"]
deny = ["hooks.invoke"]

[[serve.caller]]
name = "guest"
allow = ["*"]
`;

describe("parseToml", () => {
  it("parses tables, arrays-of-tables, strings, arrays, comments", () => {
    const root = parseToml(CONFIG);
    const policy = root.policy as Record<string, unknown>;
    expect(policy["exec.setup"]).toBe("deny");
    const serve = root.serve as Record<string, unknown>;
    expect(Array.isArray(serve.caller)).toBe(true);
  });
});

describe("policyFromToml", () => {
  it("reads the spec-shipped defaults when [policy] is absent", () => {
    const p = policyFromToml({});
    expect(p).toEqual(defaultPolicy());
    expect(p.execNonInteractive).toBe("deny");
  });

  it("maps config.toml policy keys", () => {
    const p = policyFromToml(parseToml(CONFIG));
    expect(p.execSetup).toBe("deny");
    expect(p.execHooks).toBe("ask");
    expect(p.execMcp).toBe("allow");
    expect(p.execSkillScripts).toBe("ask");
    expect(p.execNonInteractive).toBe("deny");
    expect(p.sourcesAllow).toEqual(["acme/*", "github.com/trusted/repo"]);
    expect(p.sourcesDeny).toEqual(["evil/*"]);
  });

  it("supports [policy.exec] sub-table form", () => {
    const p = policyFromToml(parseToml(`[policy.exec]\nsetup = "allow"\n`));
    expect(p.execSetup).toBe("allow");
  });
});

describe("callersFromToml", () => {
  it("reads [[serve.caller]] entries", () => {
    const callers = callersFromToml(parseToml(CONFIG));
    expect(callers).toHaveLength(2);
    expect(callers[0]).toEqual({
      name: "maki",
      token: "ahrt_abc",
      allow: ["extensions.list", "extensions.get"],
      deny: ["hooks.invoke"],
    });
    expect(callers[1]).toEqual({ name: "guest", allow: ["*"], deny: undefined });
  });

  it("returns [] without serve config", () => {
    expect(callersFromToml({})).toEqual([]);
  });
});

describe("resolveExecDecision", () => {
  it("resolves ask by interactivity", () => {
    const p = defaultPolicy();
    expect(resolveExecDecision("ask", true, p)).toBe("ask");
    expect(resolveExecDecision("ask", false, p)).toBe("deny");
    expect(resolveExecDecision("ask", false, { ...p, execNonInteractive: "allow" })).toBe("allow");
    expect(resolveExecDecision("deny", true, p)).toBe("deny");
    expect(resolveExecDecision("allow", false, p)).toBe("allow");
  });
});
