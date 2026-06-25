import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanTool } from "../src/tools/scan";
import { convertTool } from "../src/tools/convert";
import { diffManifestTool } from "../src/tools/diff-manifest";
import { writeManifestTool } from "../src/tools/write-manifest";
import { verifyIntegrityTool } from "../src/tools/verify-integrity";

let work: string;

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "mcp-test-"));
  mkdirSync(join(work, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(work, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "x", version: "1.0.0", description: "demo plugin", commands: "./commands" })
  );
  mkdirSync(join(work, "commands"), { recursive: true });
  writeFileSync(join(work, "commands", "hi.md"), "# Hi\n\nSays hi.\n");
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

function text(result: unknown): string {
  return (result as ToolResult).content[0].text;
}

describe("migrate tools", () => {
  it("scan recognizes Claude Code and lists other formats", async () => {
    const r = (await scanTool.handler({ source: work }, {} as never)) as ToolResult;
    const parsed = JSON.parse(text(r));
    expect(parsed.formats.find((f: { format: string; recognized: boolean }) => f.format === "claude-code").recognized).toBe(true);
    expect(parsed.formats.find((f: { format: string; recognized: boolean }) => f.format === "skills-sh").recognized).toBe(false);
  });

  it("convert returns a manifest + warnings + schema status", async () => {
    const r = (await convertTool.handler({ format: "claude-code", source: work }, {} as never)) as ToolResult;
    const parsed = JSON.parse(text(r));
    expect(parsed.manifest.name).toBe("x");
    expect(parsed.warnings).toBeInstanceOf(Array);
    expect(parsed.schema.valid).toBe(true);
    expect(parsed.vendorFiles.length).toBeGreaterThan(0);
  });

  it("diff_manifest reports added and changed fields", async () => {
    const before = { name: "x", version: "1.0.0", description: "demo plugin" };
    const after = { name: "x", version: "1.0.0", description: "demo plugin", commands: [{ name: "hi" }], metadata: { _ingestedFrom: "claude-code" } };
    const r = (await diffManifestTool.handler({ before, after }, {} as never)) as ToolResult;
    const parsed = JSON.parse(text(r));
    expect(parsed.added).toEqual(expect.arrayContaining(["commands", "metadata"]));
    expect(parsed.removed).toEqual([]);
    expect(parsed.changed).toEqual([]);
  });

  it("write_manifest refuses to overwrite without the flag", async () => {
    const dest = join(work, "manifest.json");
    const m = { name: "x", version: "1.0.0", description: "demo plugin" };
    await writeManifestTool.handler({ destination: dest, manifest: m, overwrite: false }, {} as never);
    const r2 = (await writeManifestTool.handler({ destination: dest, manifest: m, overwrite: false }, {} as never)) as ToolResult;
    expect(r2.isError).toBe(true);
  });

  it("write_manifest rejects a manifest that does not validate", async () => {
    const dest = join(work, "bad.json");
    const r = (await writeManifestTool.handler({ destination: dest, manifest: { name: "x" }, overwrite: true }, {} as never)) as ToolResult;
    expect(r.isError).toBe(true);
  });

  it("verify_integrity returns a sha256: string and matches when expected", async () => {
    const r = (await verifyIntegrityTool.handler({ source: work }, {} as never)) as ToolResult;
    const parsed = JSON.parse(text(r));
    expect(parsed.actual).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(parsed.match).toBeNull();
    const r2 = (await verifyIntegrityTool.handler({ source: work, expected: parsed.actual }, {} as never)) as ToolResult;
    expect(JSON.parse(text(r2)).match).toBe(true);
  });
});
