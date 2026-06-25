import { describe, it, expect } from "vitest";
import { isOsvScannerAvailable, runOsvScanner } from "../src/osv";
import { isScorecardAvailable, runScorecard } from "../src/scorecard";
import { isNpmProvenanceAvailable, checkNpmProvenance } from "../src/provenance";

describe("external CLI wrappers", () => {
  it("osv-scanner reports skipped when the CLI is missing", () => {
    const r = runOsvScanner("/tmp");
    if (!isOsvScannerAvailable()) {
      expect(r.ran).toBe(false);
      expect(r.skipped).toBe(true);
      expect(r.note).toMatch(/osv-scanner/);
    } else {
      expect(r.ran).toBe(true);
    }
    expect(r.hasCriticalOrHigh).toBe(false);
  });

  it("scorecard reports skipped when the CLI is missing", () => {
    const r = runScorecard("github.com/example/repo");
    if (!isScorecardAvailable()) {
      expect(r.ran).toBe(false);
      expect(r.skipped).toBe(true);
      expect(r.note).toMatch(/scorecard/);
    } else {
      expect(r.ran).toBe(true);
    }
    expect(["number", "object"]).toContain(typeof r.score);
  });

  it("provenance reports skipped when npm CLI is missing", () => {
    const r = checkNpmProvenance("@agentplugins/core@0.3.0");
    if (!isNpmProvenanceAvailable()) {
      expect(r.ran).toBe(false);
      expect(r.skipped).toBe(true);
      expect(r.signed).toBeNull();
    }
  });
});
