import { describe, it, expect } from "vitest";
import type { PluginManifest } from "@agentplugins/core";
import { Severity } from "@agentplugins/core";
import { createCodexAdapter } from "../src/index";

const adapter = createCodexAdapter();

const inlineManifest: PluginManifest = {
  name: "test-plugin",
  version: "1.0.0",
  hooks: {
    sessionStart: {
      handler: {
        type: "inline",
        handler: async (_ctx) => ({ additionalContext: "started" }),
      },
    },
    stop: {
      handler: {
        type: "inline",
        handler: async (_ctx) => ({ continueWith: "continue" }),
      },
    },
  } as any,
};

describe("Codex adapter — inline hook auto-wrap", () => {
  describe("validate()", () => {
    it("emits INFO (not ERROR) for inline handlers", () => {
      const issues = adapter.validate(inlineManifest);
      const errors = issues.filter((i) => i.severity === Severity.ERROR);
      const infos = issues.filter(
        (i) => i.severity === Severity.INFO && i.field?.includes("handler")
      );
      expect(errors).toHaveLength(0);
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

    it("hook entries in plugin.json point commands at ${PLUGIN_ROOT}/hooks/", () => {
      const output = adapter.compile(inlineManifest);
      const manifestFile = output.files.find((f) =>
        f.path.endsWith("plugin.json")
      );
      expect(manifestFile).toBeDefined();
      const manifest = JSON.parse(manifestFile!.content) as {
        hooks: Array<{ command?: string }>;
      };
      const inlineCommands = manifest.hooks
        .filter((h) => h.command)
        .map((h) => h.command!);
      expect(inlineCommands.length).toBe(2);
      for (const cmd of inlineCommands) {
        expect(cmd).toMatch(/\$\{PLUGIN_ROOT\}\/hooks\/__inline_/);
      }
    });

    it("emits a warning about inline handlers requiring Node.js", () => {
      const output = adapter.compile(inlineManifest);
      const hasNodeWarning = output.warnings.some((w) =>
        w.includes("Node.js")
      );
      expect(hasNodeWarning).toBe(true);
    });

    it("wrapper file content references the handlers module", () => {
      const output = adapter.compile(inlineManifest);
      const wrapper = output.files.find(
        (f) => f.path.startsWith("hooks/__inline_") && f.path.endsWith(".js")
      );
      expect(wrapper).toBeDefined();
      expect(wrapper!.content).toContain("__agentplugins_handlers__");
    });
  });
});
