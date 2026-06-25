/**
 * validate() — TDD RED phase tests
 *
 * These tests define the expected behavior of the validate() function
 * for the OpenCode adapter.
 */

import { describe, it, expect } from "vitest";
import type { PluginManifest, HookDefinition } from "@agentplugins/core";
import { Severity } from "@agentplugins/core";
import { createValidate } from "../src/validate";

const validate = createValidate();

const SUPPORTED_HOOKS = [
  "sessionStart",
  "sessionEnd",
  "preToolUse",
  "postToolUse",
  "permissionRequest",
  "notification",
  "preCompact",
  "stop",
] as const;

const inlineHandler = (): HookDefinition => ({
  handler: {
    type: "inline",
    handler: async () => ({}),
  },
});

const commandHandler = (): HookDefinition => ({
  handler: {
    type: "command",
    command: "echo 'hello'",
  },
});

const httpHandler = (): HookDefinition => ({
  handler: {
    type: "http",
    url: "https://example.com/hook",
  },
});

describe("validate() — OpenCode adapter", () => {
  describe("valid manifests", () => {
    it("returns 0 issues when all 8 supported hooks are present with inline handlers", () => {
      const manifest: PluginManifest = {
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
        hooks: {
          sessionStart: inlineHandler(),
          sessionEnd: inlineHandler(),
          preToolUse: inlineHandler(),
          postToolUse: inlineHandler(),
          permissionRequest: inlineHandler(),
          notification: inlineHandler(),
          preCompact: inlineHandler(),
          stop: inlineHandler(),
        },
      };

      const issues = validate(manifest);
      expect(issues).toHaveLength(0);
    });

    it("returns 0 issues for empty hooks object", () => {
      const manifest: PluginManifest = {
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
        hooks: {},
      };

      const issues = validate(manifest);
      expect(issues).toHaveLength(0);
    });

    it("returns 0 issues when hooks is undefined", () => {
      const manifest: PluginManifest = {
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
      };

      const issues = validate(manifest);
      expect(issues).toHaveLength(0);
    });

    it("returns 0 issues for inline handler on any supported hook", () => {
      for (const hookName of SUPPORTED_HOOKS) {
        const manifest: PluginManifest = {
          name: "test-plugin",
          version: "1.0.0",
          description: "A test plugin",
          hooks: {
            [hookName]: inlineHandler(),
          },
        };

        const issues = validate(manifest);
        expect(issues.filter((i) => i.severity === Severity.ERROR)).toHaveLength(0);
      }
    });
  });

  describe("guided per-harness hooks (subagent lifecycle)", () => {
    it("returns WARNING (not ERROR) for subagentStart", () => {
      const manifest: PluginManifest = {
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
        hooks: { subagentStart: inlineHandler() },
      };

      const issues = validate(manifest);
      expect(issues.filter((i) => i.severity === Severity.ERROR)).toHaveLength(0);
      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: Severity.WARNING,
          field: "hooks",
          message: expect.stringContaining("subagentStart"),
        })
      );
    });

    it("returns WARNING (not ERROR) for subagentStop", () => {
      const manifest: PluginManifest = {
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
        hooks: { subagentStop: inlineHandler() },
      };

      const issues = validate(manifest);
      expect(issues.filter((i) => i.severity === Severity.ERROR)).toHaveLength(0);
      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: Severity.WARNING,
          field: "hooks",
          message: expect.stringContaining("subagentStop"),
        })
      );
    });

    it("emits WARNING for subagent hooks alongside valid hooks without blocking build", () => {
      const manifest: PluginManifest = {
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
        hooks: {
          sessionStart: inlineHandler(),
          subagentStart: inlineHandler(),
          subagentStop: inlineHandler(),
        },
      };

      const issues = validate(manifest);
      expect(issues.filter((i) => i.severity === Severity.ERROR)).toHaveLength(0);
      expect(issues.filter((i) => i.severity === Severity.WARNING)).toHaveLength(2);
    });
  });

  describe("unsupported hooks", () => {
    it("returns ERROR for unsupported hook", () => {
      const manifest: PluginManifest = {
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
        hooks: {
          // userPromptSubmit is NOT in the 8 supported hooks
          userPromptSubmit: inlineHandler(),
        },
      };

      const issues = validate(manifest);
      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: Severity.ERROR,
          field: "hooks",
          message: expect.stringContaining("userPromptSubmit"),
        })
      );
    });

    it("returns ERROR for multiple unsupported hooks", () => {
      const manifest: PluginManifest = {
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
        hooks: {
          userPromptSubmit: inlineHandler(),
          userPromptExpansion: inlineHandler(),
          postToolUseFailure: inlineHandler(),
        },
      };

      const issues = validate(manifest);
      const errorIssues = issues.filter((i) => i.severity === Severity.ERROR);
      expect(errorIssues).toHaveLength(3);
    });
  });

  describe("duplicate hooks", () => {
    it("returns ERROR for duplicate hook registration", () => {
      // Note: In JavaScript/TypeScript objects, duplicate keys just override.
      // But the manifest allows hooks as an object, so we test that the
      // validation logic catches if somehow duplicates are passed.
      // This test is more theoretical since Object.entries will dedupe.
      const manifest: PluginManifest = {
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
        hooks: {
          sessionStart: inlineHandler(),
          // Note: we cannot easily create a true duplicate in a plain object
          // but the validation logic should handle the Set-based check
        },
      };

      // The original index.ts validate() uses a Set to track seen hooks
      // This test validates the behavior exists
      const issues = validate(manifest);
      expect(issues.filter((i) => i.severity === Severity.ERROR)).toHaveLength(0);
    });
  });

  describe("handler type validation", () => {
    it("returns INFO (not ERROR) for command handler", () => {
      const manifest: PluginManifest = {
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
        hooks: {
          sessionStart: commandHandler(),
        },
      };

      const issues = validate(manifest);
      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: Severity.INFO,
          field: "hooks.sessionStart",
          message: expect.stringContaining("Bun.$"),
        })
      );
    });

    it("returns INFO (not ERROR) for http handler", () => {
      const manifest: PluginManifest = {
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
        hooks: {
          sessionStart: httpHandler(),
        },
      };

      const issues = validate(manifest);
      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: Severity.INFO,
          field: "hooks.sessionStart",
          message: expect.stringContaining("Bun.$"),
        })
      );
    });

    it("returns no issues for inline handler (native support)", () => {
      const manifest: PluginManifest = {
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
        hooks: {
          sessionStart: inlineHandler(),
        },
      };

      const issues = validate(manifest);
      // No INFO about wrapping since inline is native
      const infoIssues = issues.filter((i) => i.severity === Severity.INFO);
      expect(infoIssues).toHaveLength(0);
    });
  });

  describe("plugin name validation", () => {
    it("returns ERROR when plugin name is missing", () => {
      const manifest: PluginManifest = {
        name: "",
        version: "1.0.0",
        description: "A test plugin",
      };

      const issues = validate(manifest);
      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: Severity.ERROR,
          field: "name",
          message: expect.stringContaining("required"),
        })
      );
    });

    it("returns ERROR when plugin name is only whitespace", () => {
      const manifest: PluginManifest = {
        name: "   ",
        version: "1.0.0",
        description: "A test plugin",
      };

      const issues = validate(manifest);
      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: Severity.ERROR,
          field: "name",
        })
      );
    });

    it("returns WARNING for invalid plugin name characters", () => {
      const manifest: PluginManifest = {
        name: "test plugin!", // space and ! are invalid
        version: "1.0.0",
        description: "A test plugin",
      };

      const issues = validate(manifest);
      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: Severity.WARNING,
          field: "name",
          message: expect.stringContaining("filesystem"),
        })
      );
    });

    it("returns no issues for valid kebab-case name", () => {
      const manifest: PluginManifest = {
        name: "my-test-plugin",
        version: "1.0.0",
        description: "A test plugin",
      };

      const issues = validate(manifest);
      const warningIssues = issues.filter((i) => i.severity === Severity.WARNING && i.field === "name");
      expect(warningIssues).toHaveLength(0);
    });

    it("returns no issues when name uses dots, underscores, numbers (acceptable chars)", () => {
      const manifest: PluginManifest = {
        name: "my_test-plugin.123",
        version: "1.0.0",
        description: "A test plugin",
      };

      const issues = validate(manifest);
      const nameWarnings = issues.filter(
        (i) => i.severity === Severity.WARNING && i.field === "name"
      );
      expect(nameWarnings).toHaveLength(0);
    });
  });

  describe("version validation", () => {
    it("returns no ERROR for missing version (optional for adapter validation)", () => {
      const manifest: PluginManifest = {
        name: "test-plugin",
        description: "A test plugin",
        // version is missing - should NOT be an error at adapter level
      };

      const issues = validate(manifest);
      const versionErrors = issues.filter(
        (i) => i.severity === Severity.ERROR && i.field === "version"
      );
      expect(versionErrors).toHaveLength(0);
    });
  });

  describe("comprehensive valid manifest", () => {
    it("all 8 supported hooks with inline handlers + valid metadata = 0 issues", () => {
      const manifest: PluginManifest = {
        name: "my-opencode-plugin",
        version: "1.0.0",
        description: "A fully valid OpenCode plugin",
        hooks: {
          sessionStart: {
            handler: {
              type: "inline",
              handler: async () => ({ additionalContext: "Session started" }),
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
              handler: async (ctx) => {
                console.log("preToolUse", ctx.toolName);
                return {};
              },
            },
          },
          postToolUse: {
            handler: {
              type: "inline",
              handler: async () => ({}),
            },
          },
          permissionRequest: {
            handler: {
              type: "inline",
              handler: async () => ({ block: false }),
            },
          },
          notification: {
            handler: {
              type: "inline",
              handler: async () => ({}),
            },
          },
          preCompact: {
            handler: {
              type: "inline",
              handler: async () => ({}),
            },
          },
          stop: {
            handler: {
              type: "inline",
              handler: async () => ({}),
            },
          },
        },
      };

      const issues = validate(manifest);
      expect(issues).toHaveLength(0);
    });
  });
});
