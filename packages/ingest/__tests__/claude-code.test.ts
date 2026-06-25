import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestClaudeCode } from "../src/claude-code";

let work: string;

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "ingest-claude-"));
  mkdirSync(join(work, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(work, ".claude-plugin", "plugin.json"),
    JSON.stringify({
      name: "demo",
      version: "1.2.3",
      description: "A Claude Code demo plugin",
      commands: "./commands",
      hooks: "./hooks/hooks.json",
      mcpServers: "./.mcp.json",
    })
  );
  mkdirSync(join(work, "commands"), { recursive: true });
  writeFileSync(join(work, "commands", "hello.md"), "# Hello\n\nPrints a friendly greeting.\n");
  mkdirSync(join(work, "hooks"), { recursive: true });
  writeFileSync(
    join(work, "hooks", "hooks.json"),
    JSON.stringify({
      hooks: {
        PreToolUse: [{ hooks: [{ type: "command", command: "echo block" }] }],
        UserPromptSubmit: [{ hooks: [{ type: "command", command: "echo submit" }] }],
      },
    })
  );
  writeFileSync(
    join(work, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        "fetch-server": { command: "node", args: ["fetch.js"] },
      },
    })
  );
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe("ingestClaudeCode", () => {
  it("translates a happy-path Claude Code plugin", () => {
    const result = ingestClaudeCode(work);
    expect(result.format).toBe("claude-code");
    expect(result.manifest.name).toBe("demo");
    expect(result.manifest.version).toBe("1.2.3");
    expect(result.manifest.description).toBe("A Claude Code demo plugin");
    const commands = result.manifest.commands as Array<{ name: string }>;
    expect(commands).toHaveLength(1);
    expect(commands[0].name).toBe("hello");
    const hooks = result.manifest.hooks as Record<string, unknown>;
    expect(hooks.preToolUse).toBeDefined();
    expect(hooks.userPromptSubmit).toBeDefined();
    const mcp = result.manifest.mcpServers as Record<string, { command: string }>;
    expect(mcp["fetch-server"].command).toBe("node");
  });

  it("emits a warning when a hook can return a value", () => {
    const result = ingestClaudeCode(work);
    const codes = result.warnings.map((w) => w.code);
    expect(codes).toContain("unsupported-hook-return");
  });

  it("vendors source files for the install step to copy", () => {
    const result = ingestClaudeCode(work);
    const relPaths = result.vendorFiles.map((v) => v.relativePath);
    expect(relPaths).toEqual(expect.arrayContaining([expect.stringMatching(/commands[/\\]hello\.md/)]));
    expect(relPaths).toEqual(expect.arrayContaining([expect.stringMatching(/hooks[/\\]hooks\.json/)]));
    expect(relPaths).toEqual(expect.arrayContaining([expect.stringMatching(/\.mcp\.json$/)]));
  });

  it("returns an error warning when no Claude manifest exists", () => {
    const empty = mkdtempSync(join(tmpdir(), "ingest-empty-"));
    const result = ingestClaudeCode(empty);
    expect(result.warnings.some((w) => w.code === "no-claude-manifest")).toBe(true);
    rmSync(empty, { recursive: true, force: true });
  });
});
