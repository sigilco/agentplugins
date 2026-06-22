/**
 * e2e-example-logger.test.ts — E2E test for example-logger manifest compilation
 *
 * Verifies that the example-logger manifest structure can be compiled
 * through adapter-opencode and the output matches the expected structure.
 */

import { describe, it, expect } from "vitest";
import { createOpenCodeAdapter } from "../src/factory";

/**
 * Mock manifest matching the example-logger plugin structure.
 * This mirrors plugins/example-logger/agentplugins.config.ts.
 */
const EXAMPLE_LOGGER_MANIFEST = {
  name: "agentplugins-example-logger",
  version: "0.1.0",
  description: "Cross-platform logging and security plugin for AI agent harnesses",
  hooks: {
    sessionStart: {
      handler: {
        type: "inline",
        handler: async (ctx: { sessionId: string; source?: string }) => {
          const timestamp = new Date().toISOString();
          const source = ctx.source || "unknown";
          return {
            additionalContext: `\n## Audit Log Plugin\nAll tool calls are being logged for security review. Plugin active since ${timestamp}.\n`,
          };
        },
      },
    },
    sessionEnd: {
      handler: {
        type: "inline",
        handler: async (_ctx: { sessionId: string }) => {
          // No return value needed
        },
      },
    },
    preToolUse: {
      handler: {
        type: "inline",
        handler: async (ctx: { toolName: string; toolInput: unknown; sessionId: string }) => {
          // Security policy would go here
          return { continue: true };
        },
      },
    },
    postToolUse: {
      handler: {
        type: "inline",
        handler: async (ctx: { toolName: string; sessionId: string }) => {
          // Logging would go here
        },
      },
    },
  },
};

describe("E2E: example-logger manifest compilation", () => {
  const adapter = createOpenCodeAdapter();

  it("should compile successfully", () => {
    const output = adapter.compile(EXAMPLE_LOGGER_MANIFEST);

    expect(output).toBeDefined();
    expect(output.files).toBeInstanceOf(Array);
    expect(output.files.length).toBe(2);
    expect(output.manifest).toBeDefined();
    expect(output.manifest.name).toBe("agentplugins-example-logger");
    expect(output.manifest.version).toBe("0.1.0");
    expect(output.issues).toBeInstanceOf(Array);
  });

  it("should generate valid .ts plugin file", () => {
    const output = adapter.compile(EXAMPLE_LOGGER_MANIFEST);
    const tsFile = output.files.find((f) => f.path.endsWith(".ts"));

    expect(tsFile).toBeDefined();
    expect(tsFile?.path).toBe("agentplugins-example-logger.ts");
    expect(tsFile?.content).toContain("export default");
    expect(tsFile?.content).toContain("async function");

    // Should NOT contain undefined ctx references
    expect(tsFile?.content).not.toContain("(handler)(ctx)");
    expect(tsFile?.content).not.toContain("handler(ctx)");
  });

  it("should generate valid opencode.json", () => {
    const output = adapter.compile(EXAMPLE_LOGGER_MANIFEST);
    const jsonFile = output.files.find((f) => f.path === "opencode.json");

    expect(jsonFile).toBeDefined();

    // Should parse as valid JSON
    const json = JSON.parse(jsonFile!.content);
    expect(json.name).toBe("agentplugins-example-logger");
    expect(json.version).toBe("0.1.0");
    expect(json.description).toBe("Cross-platform logging and security plugin for AI agent harnesses");
    expect(json.hooks).toBeDefined();
    expect(json.license).toBe("MIT");
  });

  it("should match reference output structure - hook keys", () => {
    const output = adapter.compile(EXAMPLE_LOGGER_MANIFEST);
    const tsFile = output.files.find((f) => f.path.endsWith(".ts"));
    const jsonFile = output.files.find((f) => f.path === "opencode.json");

    // Reference output structure shows these hooks
    const expectedHookKeys = ["event", "tool.execute.before", "tool.execute.after"];

    // TypeScript file should contain hook registrations
    for (const key of expectedHookKeys) {
      expect(tsFile?.content).toContain(`"${key}"`);
    }

    // opencode.json should have these hooks enabled
    const json = JSON.parse(jsonFile!.content);
    expect(json.hooks.event).toBe(true);
    expect(json.hooks["tool.execute.before"]).toBe(true);
    expect(json.hooks["tool.execute.after"]).toBe(true);
  });

  it("should match reference output structure - event hook content", () => {
    const output = adapter.compile(EXAMPLE_LOGGER_MANIFEST);
    const tsFile = output.files.find((f) => f.path.endsWith(".ts"));

    // Event hook should have session.created and session.deleted conditions
    expect(tsFile?.content).toContain('event.type === "session.created"');
    expect(tsFile?.content).toContain('event.type === "session.deleted"');

    // Should contain handler invocation
    expect(tsFile?.content).toContain("[sessionStart] inline handler");
    expect(tsFile?.content).toContain("[sessionEnd] inline handler");
  });

  it("should match reference output structure - tool hooks", () => {
    const output = adapter.compile(EXAMPLE_LOGGER_MANIFEST);
    const tsFile = output.files.find((f) => f.path.endsWith(".ts"));

    // Tool hooks should have pre/post tool use markers
    expect(tsFile?.content).toContain("[preToolUse] inline handler");
    expect(tsFile?.content).toContain("[postToolUse] inline handler");

    // Should use input/output arguments for tool hooks
    expect(tsFile?.content).toContain("input, output");
  });

  it("should produce valid TypeScript (no syntax errors)", () => {
    const output = adapter.compile(EXAMPLE_LOGGER_MANIFEST);
    const tsFile = output.files.find((f) => f.path.endsWith(".ts"));

    // Basic TypeScript syntax checks
    const content = tsFile!.content;

    // Should have balanced braces
    const openBraces = (content.match(/{/g) || []).length;
    const closeBraces = (content.match(/}/g) || []).length;
    expect(openBraces).toBe(closeBraces);

    // Should have balanced parentheses
    const openParens = (content.match(/\(/g) || []).length;
    const closeParens = (content.match(/\)/g) || []).length;
    expect(openParens).toBe(closeParens);

    // Should export a default function
    expect(content).toMatch(/^export default async function\s*\(/m);

    // Should have async handlers
    expect(content).toMatch(/async\s*\(/);
  });

  it("should include postInstall instructions", () => {
    const output = adapter.compile(EXAMPLE_LOGGER_MANIFEST);

    expect(output.postInstall).toBeDefined();
    expect(output.postInstall.length).toBe(2);
    expect(output.postInstall[0]).toContain("agentplugins-example-logger.ts");
    expect(output.postInstall[1]).toContain("opencode.json");
  });

  it("should match reference opencode.json structure", () => {
    const output = adapter.compile(EXAMPLE_LOGGER_MANIFEST);
    const jsonFile = output.files.find((f) => f.path === "opencode.json");

    const json = JSON.parse(jsonFile!.content);

    // Reference structure from plugins/example-logger/dist/opencode/opencode.json
    expect(json).toHaveProperty("name");
    expect(json).toHaveProperty("description");
    expect(json).toHaveProperty("version");
    expect(json).toHaveProperty("author");
    expect(json).toHaveProperty("license");
    expect(json).toHaveProperty("hooks");
    expect(json).toHaveProperty("tools");
    expect(json).toHaveProperty("discovery");

    // Discovery paths should be present
    expect(json.discovery.paths).toContain(".opencode/plugins/");
    expect(json.discovery.paths).toContain("~/.config/opencode/plugins/");
  });

  it("should not have issues for supported hooks", () => {
    const output = adapter.compile(EXAMPLE_LOGGER_MANIFEST);

    // All hooks in example-logger are supported by opencode
    const errorIssues = output.issues.filter((i) => i.severity === "error");
    expect(errorIssues).toHaveLength(0);
  });
});
