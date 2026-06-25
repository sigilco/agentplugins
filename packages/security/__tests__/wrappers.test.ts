import { describe, it, expect } from "vitest";
import { isOsvScannerAvailable, runOsvScanner } from "../src/osv";
import { isScorecardAvailable, runScorecard } from "../src/scorecard";
import { isNpmProvenanceAvailable, checkNpmProvenance } from "../src/provenance";

// External CLI calls can be slow on flaky networks.
const SLOW = 30_000;

describe("external CLI wrappers", () => {
  it("osv-scanner: skipped or ran", () => {
    const r = runOsvScanner("/tmp");
    if (!isOsvScannerAvailable()) {
      expect(r.ran).toBe(false);
      expect(r.skipped).toBe(true);
      expect(r.note).toMatch(/osv-scanner/);
    } else {
      expect(r.ran).toBe(true);
    }
    expect(r.hasCriticalOrHigh).toBe(false);
  }, SLOW);

  it("scorecard: skipped or ran", () => {
    const r = runScorecard("github.com/example/repo");
    if (!isScorecardAvailable()) {
      expect(r.ran).toBe(false);
      expect(r.skipped).toBe(true);
      expect(r.note).toMatch(/scorecard/);
    } else {
      expect(r.ran).toBe(true);
    }
  }, SLOW);

  it("provenance: skipped or ran", () => {
    const r = checkNpmProvenance("@agentplugins/core@0.3.0");
    if (!isNpmProvenanceAvailable()) {
      expect(r.ran).toBe(false);
      expect(r.skipped).toBe(true);
      expect(r.signed).toBeNull();
    } else {
      // npm was on PATH; the result may be ran=true with signed=null if npm
      // didn't actually audit any lockfile. We just verify the structure.
      expect(r.spec).toBe("@agentplugins/core@0.3.0");
    }
  }, SLOW);
});
