import { describe, it, expect } from "vitest";
import type { PluginManifest } from "@agentplugins/core";
import { Severity } from "@agentplugins/core";
import { createPiMonoAdapter } from "../src/index";

const adapter = createPiMonoAdapter({ pluginRoot: "/tmp/test-plugin" });

describe("validatePlugin() — Pi Mono adapter", () => {
  describe("mcpServers warning", () => {
    it("emits WARNING when mcpServers is set", () => {
      const manifest: PluginManifest = {
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
        mcpServers: {
          "my-server": { command: "npx", args: ["my-mcp-server"] },
        },
      };

      const issues = adapter.validate(manifest);
      expect(issues.filter((i) => i.severity === Severity.ERROR)).toHaveLength(0);
      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: Severity.WARNING,
          field: "mcpServers",
          message: expect.stringContaining("Pi Mono has no built-in MCP support"),
        })
      );
    });

    it("WARNING message points to the escape-hatch docs", () => {
      const manifest: PluginManifest = {
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
        mcpServers: { server: { command: "node", args: ["server.js"] } },
      };

      const issues = adapter.validate(manifest);
      const warn = issues.find((i) => i.field === "mcpServers");
      expect(warn?.message).toContain("nativeEntry.pimono");
      expect(warn?.message).toContain("porting#mcp-on-pi");
    });

    it("does not emit WARNING when mcpServers is empty", () => {
      const manifest: PluginManifest = {
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
        mcpServers: {},
      };

      const issues = adapter.validate(manifest);
      expect(issues.filter((i) => i.field === "mcpServers")).toHaveLength(0);
    });

    it("does not emit WARNING when mcpServers is absent", () => {
      const manifest: PluginManifest = {
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
      };

      const issues = adapter.validate(manifest);
      expect(issues.filter((i) => i.field === "mcpServers")).toHaveLength(0);
    });

    it("mcpServers WARNING coexists with other valid manifest fields", () => {
      const manifest: PluginManifest = {
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
        hooks: {
          sessionStart: {
            handler: { type: "inline", handler: async () => ({}) },
          },
        },
        mcpServers: { server: { command: "node", args: ["server.js"] } },
      };

      const issues = adapter.validate(manifest);
      expect(issues.filter((i) => i.severity === Severity.ERROR)).toHaveLength(0);
      const warns = issues.filter((i) => i.severity === Severity.WARNING);
      expect(warns).toHaveLength(1);
      expect(warns[0].field).toBe("mcpServers");
    });
  });
});
