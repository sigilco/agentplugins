import { describe, expect, it } from "vitest";
import { inspectPackage, isValidExtensionName, parseManifestText, validateManifest } from "./manifest.js";
import { createMemFs } from "./testing.js";

const base = {
  $schema: "https://agents.json/plugin.schema.json",
  name: "demo",
  version: "1.0.0",
};

const errorsOf = (r: { issues: { level: string }[] }) => r.issues.filter((i) => i.level === "error");
const warningsOf = (r: { issues: { level: string }[] }) => r.issues.filter((i) => i.level === "warning");

describe("validateManifest", () => {
  it("accepts a minimal Agent Plugins manifest", () => {
    const r = validateManifest(base);
    expect(r.manifest?.name).toBe("demo");
    expect(errorsOf(r)).toHaveLength(0);
  });

  it("requires $schema, name, version", () => {
    for (const missing of ["$schema", "name", "version"] as const) {
      const doc = { ...base };
      delete (doc as Record<string, unknown>)[missing];
      const r = validateManifest(doc);
      expect(r.manifest === undefined || errorsOf(r).length > 0).toBe(true);
    }
  });

  it("namespaceVersion > 1 → warn and skip namespace", () => {
    const r = validateManifest({ ...base, extensions: { "dev.anyharness": { namespaceVersion: 99 } } });
    expect(warningsOf(r).length).toBeGreaterThan(0);
    expect(r.manifest?.namespace).toBeUndefined();
  });

  it("engines.harness range is checked", () => {
    const r = validateManifest({ ...base, extensions: { "dev.anyharness": { namespaceVersion: 1, engines: { harness: ">=99.0.0" } } } });
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it("isValidExtensionName enforces §5.5", () => {
    expect(isValidExtensionName("demo-plugin-2")).toBe(true);
    expect(isValidExtensionName("demo_plugin")).toBe(false);
    expect(isValidExtensionName("")).toBe(false);
    expect(isValidExtensionName("a".repeat(65))).toBe(false);
    expect(isValidExtensionName("bad name")).toBe(false);
    expect(isValidExtensionName("../evil")).toBe(false);
  });

  it("parseManifestText surfaces invalid JSON", () => {
    expect(parseManifestText("{oops").manifest).toBeUndefined();
  });
});

describe("inspectPackage", () => {
  it("inventories components: skills dir, mcp.json, hooks, commands/agents/rules, setup", async () => {
    const fs = createMemFs();
    fs.putFile("/pkg/plugin.json", JSON.stringify(base));
    fs.putFile("/pkg/skills/helper/SKILL.md", "---\nname: helper\n---\nx");
    fs.putFile("/pkg/mcp.json", JSON.stringify({ mcpServers: { a: { command: "a" } } }));
    fs.putFile("/pkg/dev.anyharness/hooks.json", JSON.stringify({ hooks: { "tool.before": [{ command: "./h.sh" }] } }));
    fs.putFile("/pkg/dev.anyharness/commands/run.md", "Run.");
    fs.putFile("/pkg/dev.anyharness/agents/rev.md", "Review.");
    fs.putFile("/pkg/dev.anyharness/rules/r.md", "Rule.");
    fs.putFile("/pkg/dev.anyharness/setup", "echo hi");
    const ins = await inspectPackage(fs, "/pkg");
    const kinds = ins.components.map((c) => c.kind);
    for (const k of ["skill", "mcp", "hook", "command", "agent", "rule"]) expect(kinds).toContain(k as never);
    expect(ins.hasSetupScript).toBe(true);
    expect(ins.mcpServers.map((s) => s.name)).toContain("a");
  });

  it("standalone SKILL.md dir → skill via standaloneSkill", async () => {
    const fs = createMemFs();
    fs.putFile("/sk/SKILL.md", "---\nname: solo\ndescription: d\n---\nx");
    const ins = await inspectPackage(fs, "/sk");
    expect(ins.standaloneSkill?.name).toBe("solo");
  });
});
