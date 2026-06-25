import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestCodex } from "../src/codex";

let work: string;

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "ingest-codex-"));
  mkdirSync(join(work, ".codex-plugin"), { recursive: true });
  writeFileSync(
    join(work, ".codex-plugin", "plugin.json"),
    JSON.stringify({
      name: "codex-demo",
      version: "0.1.0",
      description: "A Codex CLI demo plugin",
      hooks: "./hooks.json",
    })
  );
  writeFileSync(
    join(work, "hooks.json"),
    JSON.stringify({
      hooks: {
        pre_tool_use: [{ command: "echo block" }],
        session_start: [{ command: "echo start" }],
      },
    })
  );
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe("ingestCodex", () => {
  it("translates Codex plugin.json + hooks.json", () => {
    const result = ingestCodex(work);
    expect(result.format).toBe("codex");
    expect(result.manifest.name).toBe("codex-demo");
    expect(result.manifest.version).toBe("0.1.0");
    const hooks = result.manifest.hooks as Record<string, { handler: { command: string } }>;
    expect(hooks.preToolUse.handler.command).toBe("echo block");
    expect(hooks.sessionStart.handler.command).toBe("echo start");
  });

  it("flags return-value hooks with a warning", () => {
    const result = ingestCodex(work);
    expect(result.warnings.some((w) => w.code === "unsupported-hook-return")).toBe(true);
  });

  it("errors when the Codex manifest is missing", () => {
    const empty = mkdtempSync(join(tmpdir(), "codex-empty-"));
    const result = ingestCodex(empty);
    expect(result.warnings.some((w) => w.code === "no-codex-manifest")).toBe(true);
    rmSync(empty, { recursive: true, force: true });
  });
});
