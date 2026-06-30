/**
 * compile.integration.test.ts — Integration tests for compile()
 *
 * Tests the full compile() pipeline wiring together validate,
 * hook-mapping, handler-invocation, and output-generators.
 */

import { describe, it, expect } from "vitest";
import type { PluginManifest, AdapterOutput } from "@agentplugins/core";
import { createOpenCodeAdapter } from "../src/factory";

const adapter = createOpenCodeAdapter();

describe("compile() integration", () => {
  describe("empty manifest", () => {
    it("returns AdapterOutput with plugin file and manifest", () => {
      const manifest: PluginManifest = {
        name: "test-plugin",
        version: "1.0.0",
      };

      const output = adapter.compile(manifest);

      expect(output).toHaveProperty("files");
      expect(output.files.length).toBeGreaterThanOrEqual(2);
      expect(output.files[0].path).toBe("plugins/test-plugin.ts");
      expect(output.files[1].path).toBe("opencode.json");
    });

    it("returns AdapterOutput with manifest metadata", () => {
      const manifest: PluginManifest = {
        name: "my-plugin",
        version: "2.0.0",
      };

      const output = adapter.compile(manifest);

      expect(output.manifest.name).toBe("my-plugin");
      expect(output.manifest.version).toBe("2.0.0");
    });

    it("returns empty issues for valid manifest", () => {
      const manifest: PluginManifest = {
        name: "test-plugin",
        version: "1.0.0",
      };

      const output = adapter.compile(manifest);

      expect(output.issues).toEqual([]);
    });
  });

  describe("sessionStart hook", () => {
    it("generates TypeScript plugin file with event hook", () => {
      const manifest: PluginManifest = {
        name: "session-plugin",
        version: "1.0.0",
        hooks: {
          sessionStart: {
            handler: {
              type: "inline",
              handler: async () => ({}),
            },
          },
        },
      };

      const output = adapter.compile(manifest);

      const pluginFile = output.files.find((f) => f.path.endsWith(".ts"));
      expect(pluginFile).toBeDefined();
      expect(pluginFile?.content).toContain("export default async function(ctx)");
      expect(pluginFile?.content).toContain('"event"');
      expect(pluginFile?.content).toContain('event.type === "session.created"');
    });

    it("generates opencode.json with event hook registered", () => {
      const manifest: PluginManifest = {
        name: "session-plugin",
        version: "1.0.0",
        hooks: {
          sessionStart: {
            handler: {
              type: "inline",
              handler: async () => ({}),
            },
          },
        },
      };

      const output = adapter.compile(manifest);

      const manifestFile = output.files.find((f) => f.path === "opencode.json");
      expect(manifestFile).toBeDefined();
      const parsed = JSON.parse(manifestFile!.content);
      expect(parsed.hooks.event).toBe(true);
    });
  });

  describe("multiple hooks", () => {
    it("generates plugin file with all hook types", () => {
      const manifest: PluginManifest = {
        name: "multi-hook-plugin",
        version: "1.0.0",
        hooks: {
          sessionStart: {
            handler: {
              type: "inline",
              handler: async () => ({}),
            },
          },
          preToolUse: {
            handler: {
              type: "inline",
              handler: async () => ({}),
            },
          },
          postToolUse: {
            handler: {
              type: "inline",
              handler: async () => ({}),
            },
          },
        },
      };

      const output = adapter.compile(manifest);

      const pluginFile = output.files.find((f) => f.path.endsWith(".ts"));
      expect(pluginFile?.content).toContain('"event"');
      expect(pluginFile?.content).toContain('"tool.execute.before"');
      expect(pluginFile?.content).toContain('"tool.execute.after"');
    });

    it("generates manifest with all hook keys", () => {
      const manifest: PluginManifest = {
        name: "multi-hook-plugin",
        version: "1.0.0",
        hooks: {
          sessionStart: {
            handler: {
              type: "inline",
              handler: async () => ({}),
            },
          },
          preToolUse: {
            handler: {
              type: "inline",
              handler: async () => ({}),
            },
          },
          postToolUse: {
            handler: {
              type: "inline",
              handler: async () => ({}),
            },
          },
        },
      };

      const output = adapter.compile(manifest);

      const manifestFile = output.files.find((f) => f.path === "opencode.json");
      const parsed = JSON.parse(manifestFile!.content);
      expect(parsed.hooks.event).toBe(true);
      expect(parsed.hooks["tool.execute.before"]).toBe(true);
      expect(parsed.hooks["tool.execute.after"]).toBe(true);
    });

    it("includes handler invocation code in plugin file", () => {
      const manifest: PluginManifest = {
        name: "handler-test",
        version: "1.0.0",
        hooks: {
          preToolUse: {
            handler: {
              type: "inline",
              handler: async (ctx) => {
                console.log("preToolUse", ctx.toolName);
                return {};
              },
            },
          },
        },
      };

      const output = adapter.compile(manifest);

      const pluginFile = output.files.find((f) => f.path.endsWith(".ts"));
      expect(pluginFile?.content).toContain("[preToolUse] inline handler");
      expect(pluginFile?.content).toContain("preToolUse");
    });
  });

  describe("validation issues", () => {
    it("includes validation issue for unsupported hook", () => {
      const manifest: PluginManifest = {
        name: "test-plugin",
        version: "1.0.0",
        hooks: {
          userPromptSubmit: {
            handler: {
              type: "inline",
              handler: async () => ({}),
            },
          },
        },
      };

      const output = adapter.compile(manifest);

      const errorIssues = output.issues.filter((i) => i.severity === "error");
      expect(errorIssues.length).toBeGreaterThan(0);
      expect(errorIssues[0].message).toContain("userPromptSubmit");
    });

    it("returns issues for unsupported hook without crashing", () => {
      const manifest: PluginManifest = {
        name: "test-plugin",
        version: "1.0.0",
        hooks: {
          userPromptExpansion: {
            handler: {
              type: "inline",
              handler: async () => ({}),
            },
          },
        },
      };

      const output = adapter.compile(manifest);

      expect(output.files).toBeDefined();
      expect(output.files.length).toBe(2);
    });
  });

  describe("reference output matching", () => {
    it("produces output structure matching example-logger", () => {
      const manifest: PluginManifest = {
        name: "agentplugins-example-logger",
        version: "0.1.0",
        description: "Cross-platform logging and security plugin",
        hooks: {
          sessionStart: {
            handler: {
              type: "inline",
              handler: async (ctx) => ({
                additionalContext: "Logger active",
              }),
            },
          },
          sessionEnd: {
            handler: {
              type: "inline",
              handler: async () => ({}),
            },
          },
          preToolUse: {
            handler: {
              type: "inline",
              handler: async () => ({}),
            },
          },
          postToolUse: {
            handler: {
              type: "inline",
              handler: async () => ({}),
            },
          },
        },
      };

      const output = adapter.compile(manifest);

      expect(output.files.length).toBe(2);

      const pluginFile = output.files.find((f) => f.path.endsWith(".ts"));
      expect(pluginFile?.content).toContain("export default async function(ctx)");
      expect(pluginFile?.content).toContain('"event"');
      expect(pluginFile?.content).toContain('"tool.execute.before"');
      expect(pluginFile?.content).toContain('"tool.execute.after"');

      const manifestFile = output.files.find((f) => f.path === "opencode.json");
      expect(manifestFile).toBeDefined();
      const parsed = JSON.parse(manifestFile!.content);
      expect(parsed.name).toBe("agentplugins-example-logger");
      expect(parsed.version).toBe("0.1.0");
      expect(parsed.hooks.event).toBe(true);
      expect(parsed.hooks["tool.execute.before"]).toBe(true);
      expect(parsed.hooks["tool.execute.after"]).toBe(true);
      expect(parsed.discovery.paths).toContain(".opencode/plugins/");
    });
  });

  describe("opencode.json manifest validation", () => {
    it("generates valid JSON in manifest file", () => {
      const manifest: PluginManifest = {
        name: "json-test",
        version: "1.0.0",
        description: "Test plugin",
      };

      const output = adapter.compile(manifest);

      const manifestFile = output.files.find((f) => f.path === "opencode.json");
      expect(() => JSON.parse(manifestFile!.content)).not.toThrow();
    });

    it("manifest contains required fields", () => {
      const manifest: PluginManifest = {
        name: "required-fields-test",
        version: "1.0.0",
        description: "Testing required fields",
        author: "Test Author",
        license: "MIT",
      };

      const output = adapter.compile(manifest);

      const manifestFile = output.files.find((f) => f.path === "opencode.json");
      const parsed = JSON.parse(manifestFile!.content);
      expect(parsed).toHaveProperty("name");
      expect(parsed).toHaveProperty("version");
      expect(parsed).toHaveProperty("description");
      expect(parsed).toHaveProperty("author");
      expect(parsed).toHaveProperty("license");
      expect(parsed).toHaveProperty("hooks");
      expect(parsed).toHaveProperty("discovery");
    });

    it("manifest has tools array", () => {
      const manifest: PluginManifest = {
        name: "tools-test",
        version: "1.0.0",
        tools: [
          {
            name: "greet",
            description: "Greets the user",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string" },
              },
            },
          },
        ],
      };

      const output = adapter.compile(manifest);

      const manifestFile = output.files.find((f) => f.path === "opencode.json");
      const parsed = JSON.parse(manifestFile!.content);
      expect(parsed.tools).toHaveLength(1);
      expect(parsed.tools[0].name).toBe("greet");
    });
  });

  describe("mcpServers emission", () => {
    it("emits mcp.servers in opencode.json when mcpServers defined", () => {
      const manifest: PluginManifest = {
        name: "mcp-plugin",
        version: "1.0.0",
        mcpServers: {
          "my-server": {
            command: "npx",
            args: ["-y", "my-mcp-server"],
            env: { MY_KEY: "value" },
          },
        },
      };

      const output = adapter.compile(manifest);

      const manifestFile = output.files.find((f) => f.path === "opencode.json");
      expect(manifestFile).toBeDefined();
      const parsed = JSON.parse(manifestFile!.content);
      expect(parsed.mcp).toBeDefined();
      expect(parsed.mcp.servers["my-server"].command).toBe("npx");
      expect(parsed.mcp.servers["my-server"].args).toEqual(["-y", "my-mcp-server"]);
      expect(parsed.mcp.servers["my-server"].env).toEqual({ MY_KEY: "value" });
    });

    it("omits mcp key when no mcpServers defined", () => {
      const manifest: PluginManifest = {
        name: "no-mcp-plugin",
        version: "1.0.0",
      };

      const output = adapter.compile(manifest);

      const manifestFile = output.files.find((f) => f.path === "opencode.json");
      const parsed = JSON.parse(manifestFile!.content);
      expect(parsed.mcp).toBeUndefined();
    });
  });

  describe("postInstall instructions", () => {
    it("includes postInstall commands", () => {
      const manifest: PluginManifest = {
        name: "install-test",
        version: "1.0.0",
      };

      const output = adapter.compile(manifest);

      expect(output.postInstall).toBeDefined();
      expect(output.postInstall.length).toBeGreaterThan(0);
      expect(output.postInstall[0]).toContain("install-test.ts");
      expect(output.postInstall[1]).toContain("opencode.json");
    });
  });
});
