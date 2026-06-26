import { describe, it, expect } from "vitest";
import type { PluginManifest } from "@agentplugins/core";
import { Severity } from "@agentplugins/core";
import { createKimiAdapter } from "../src/index";

const adapter = createKimiAdapter();

const inlineManifest: PluginManifest = {
  name: "test-plugin",
  version: "1.0.0",
  description: "test",
  hooks: {
    sessionStart: {
      handler: {
        type: "inline",
        handler: async (_ctx) => ({ additionalContext: "started" }),
      },
    },
    preToolUse: {
      handler: {
        type: "inline",
        handler: async (_ctx) => ({ continue: true }),
      },
    },
  } as any,
};

describe("Kimi adapter — inline hook auto-wrap", () => {
  describe("validate()", () => {
    it("emits INFO (not ERROR) for inline handlers", () => {
      const issues = adapter.validate(inlineManifest);
      const inlineErrors = issues.filter(
        (i) => i.severity === Severity.ERROR && i.field?.includes("handler")
      );
      const infos = issues.filter(
        (i) => i.severity === Severity.INFO && i.field?.includes("handler")
      );
      expect(inlineErrors).toHaveLength(0);
      expect(infos.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("compile()", () => {
    it("emits hooks/__agentplugins_handlers__.js", () => {
      const output = adapter.compile(inlineManifest);
      const paths = output.files.map((f) => f.path);
      expect(paths).toContain("hooks/__agentplugins_handlers__.js");
    });

    it("emits a per-hook wrapper .js file for each inline handler", () => {
      const output = adapter.compile(inlineManifest);
      const wrapperFiles = output.files.filter(
        (f) => f.path.startsWith("hooks/__inline_") && f.path.endsWith(".js")
      );
      expect(wrapperFiles.length).toBe(2);
    });

    it("sessionStart in kimi.plugin.json points at wrapper script", () => {
      const output = adapter.compile(inlineManifest);
      const manifestFile = output.files.find((f) =>
        f.path === "kimi.plugin.json"
      );
      expect(manifestFile).toBeDefined();
      const manifest = JSON.parse(manifestFile!.content) as {
        sessionStart?: string;
      };
      expect(manifest.sessionStart).toMatch(/node \.\/hooks\/__inline_/);
    });

    it("preToolUse in kimi-hooks.json points at wrapper script", () => {
      const output = adapter.compile(inlineManifest);
      const hooksFile = output.files.find((f) => f.path === "kimi-hooks.json");
      expect(hooksFile).toBeDefined();
      const hooksJson = JSON.parse(hooksFile!.content) as {
        hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
      };
      const preToolUseCmds = hooksJson.hooks["PreToolUse"]?.[0]?.hooks?.map(
        (h) => h.command
      );
      expect(preToolUseCmds).toBeDefined();
      expect(preToolUseCmds![0]).toMatch(/node \.\/hooks\/__inline_/);
    });

    it("emits a warning about inline handlers requiring Node.js", () => {
      const output = adapter.compile(inlineManifest);
      const hasNodeWarning = output.warnings.some((w) =>
        w.includes("Node.js")
      );
      expect(hasNodeWarning).toBe(true);
    });
  });
});
