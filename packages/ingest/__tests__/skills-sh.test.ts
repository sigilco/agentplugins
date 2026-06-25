import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestSkillsSh } from "../src/skills-sh";

let work: string;

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "ingest-skills-"));
  writeFileSync(
    join(work, "SKILL.md"),
    [
      "---",
      "name: skills-demo",
      "description: A Skills.sh demo plugin",
      "---",
      "",
      "# Skills Demo",
      "",
      "Top-level skill content.",
      "",
    ].join("\n")
  );
  mkdirSync(join(work, "lint"), { recursive: true });
  writeFileSync(
    join(work, "lint", "SKILL.md"),
    [
      "---",
      "name: lint",
      "description: Lints markdown files.",
      "---",
      "",
      "Lint skill body.",
      "",
    ].join("\n")
  );
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe("ingestSkillsSh", () => {
  it("synthesizes a manifest from SKILL.md files", () => {
    const result = ingestSkillsSh(work);
    expect(result.format).toBe("skills-sh");
    expect(result.manifest.name).toBe("skills-demo");
    expect(result.manifest.description).toBe("A Skills.sh demo plugin");
    const skills = result.manifest.skills as Array<{ name: string; description: string }>;
    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.name).sort()).toEqual(["lint", "skills-demo"]);
  });

  it("vendors all SKILL.md files", () => {
    const result = ingestSkillsSh(work);
    const rels = result.vendorFiles.map((v) => v.relativePath);
    expect(rels).toEqual(expect.arrayContaining(["SKILL.md", expect.stringMatching(/lint[/\\]SKILL\.md$/)]));
  });

  it("errors when there is no SKILL.md", () => {
    const empty = mkdtempSync(join(tmpdir(), "skills-empty-"));
    const result = ingestSkillsSh(empty);
    expect(result.warnings.some((w) => w.code === "no-skills-md")).toBe(true);
    rmSync(empty, { recursive: true, force: true });
  });
});
