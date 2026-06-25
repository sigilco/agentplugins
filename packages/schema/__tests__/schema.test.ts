import { describe, it, expect } from "vitest";
import {
  manifestSchema,
  adapterSchema,
  agentPaths,
  SCHEMA_VERSION,
  HOSTED_SCHEMA_URL,
  getValidator,
  validateManifest,
  isValidManifest,
} from "../src/index";

describe("@agentplugins/schema", () => {
  describe("exports", () => {
    it("exports manifest schema object", () => {
      expect(manifestSchema).toBeDefined();
      expect(manifestSchema.$id).toContain("agentplugins.dev");
      expect(manifestSchema.type).toBe("object");
    });

    it("exports adapter schema object", () => {
      expect(adapterSchema).toBeDefined();
      expect(adapterSchema.type).toBe("object");
    });

    it("exports agent paths registry", () => {
      expect(agentPaths).toBeDefined();
      expect(agentPaths.version).toBe(1);
      expect(agentPaths.agents).toHaveLength(7);
    });

    it("exports schema version", () => {
      expect(SCHEMA_VERSION).toBe(1);
    });

    it("exports hosted schema URL", () => {
      expect(HOSTED_SCHEMA_URL).toContain("https://");
    });
  });

  describe("getValidator()", () => {
    it("returns an Ajv validator instance", () => {
      const validator = getValidator();
      expect(validator).toBeDefined();
      expect(typeof validator.validate).toBe("function");
    });
  });

  describe("validateManifest()", () => {
    it("accepts a valid manifest", () => {
      const valid = {
        name: "my-plugin",
        version: "1.0.0",
        description: "A valid plugin for testing",
      };
      const result = validateManifest(valid);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects missing required fields", () => {
      const result = validateManifest({ name: "x" });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("rejects invalid version", () => {
      const result = validateManifest({
        name: "my-plugin",
        version: "not-semver",
        description: "A valid plugin for testing",
      });
      expect(result.valid).toBe(false);
    });

    it("rejects non-kebab-case names", () => {
      const result = validateManifest({
        name: "MyPlugin",
        version: "1.0.0",
        description: "A valid plugin for testing",
      });
      expect(result.valid).toBe(false);
    });

    it("rejects short descriptions", () => {
      const result = validateManifest({
        name: "my-plugin",
        version: "1.0.0",
        description: "short",
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("v1.1 fields — dependencies", () => {
    it("accepts a valid npm dependency", () => {
      const result = validateManifest({
        name: "my-plugin",
        version: "1.0.0",
        description: "A valid plugin for testing",
        dependencies: [{ type: "npm", name: "left-pad", version: "^1.0.0" }],
      });
      expect(result.valid).toBe(true);
    });

    it("accepts a valid binary dependency", () => {
      const result = validateManifest({
        name: "my-plugin",
        version: "1.0.0",
        description: "A valid plugin for testing",
        dependencies: [{ type: "binary", name: "ripgrep", required: true }],
      });
      expect(result.valid).toBe(true);
    });

    it("rejects a dependency without a name", () => {
      const result = validateManifest({
        name: "my-plugin",
        version: "1.0.0",
        description: "A valid plugin for testing",
        dependencies: [{ type: "npm", name: "" }],
      });
      expect(result.valid).toBe(false);
    });

    it("rejects a dependency without a type", () => {
      const result = validateManifest({
        name: "my-plugin",
        version: "1.0.0",
        description: "A valid plugin for testing",
        dependencies: [{ name: "left-pad" }],
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("v1.1 fields — sidecar", () => {
    it("accepts a minimal sidecar", () => {
      const result = validateManifest({
        name: "my-plugin",
        version: "1.0.0",
        description: "A valid plugin for testing",
        sidecar: { command: "node" },
      });
      expect(result.valid).toBe(true);
    });

    it("accepts a fully-specified sidecar", () => {
      const result = validateManifest({
        name: "my-plugin",
        version: "1.0.0",
        description: "A valid plugin for testing",
        sidecar: {
          command: "node",
          args: ["server.js"],
          env: { NODE_ENV: "production" },
          port: 8080,
          health: "/healthz",
          restart: "on-failure",
        },
      });
      expect(result.valid).toBe(true);
    });

    it("rejects an invalid restart policy", () => {
      const result = validateManifest({
        name: "my-plugin",
        version: "1.0.0",
        description: "A valid plugin for testing",
        sidecar: { command: "node", restart: "sometimes" },
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("v1.1 fields — integrity", () => {
    it("accepts a valid sha256 integrity string", () => {
      const sha = "a".repeat(64);
      const result = validateManifest({
        name: "my-plugin",
        version: "1.0.0",
        description: "A valid plugin for testing",
        integrity: `sha256:${sha}`,
      });
      expect(result.valid).toBe(true);
    });

    it("rejects a malformed integrity string", () => {
      const result = validateManifest({
        name: "my-plugin",
        version: "1.0.0",
        description: "A valid plugin for testing",
        integrity: "not-a-hash",
      });
      expect(result.valid).toBe(false);
    });

    it("rejects an integrity string with wrong length", () => {
      const result = validateManifest({
        name: "my-plugin",
        version: "1.0.0",
        description: "A valid plugin for testing",
        integrity: "sha256:abcd",
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("isValidManifest()", () => {
    it("returns true for valid manifests", () => {
      expect(
        isValidManifest({
          name: "my-plugin",
          version: "1.0.0",
          description: "A valid plugin for testing",
        })
      ).toBe(true);
    });

    it("returns false for invalid manifests", () => {
      expect(isValidManifest({})).toBe(false);
    });

    it("acts as a type guard", () => {
      const data: unknown = {
        name: "my-plugin",
        version: "1.0.0",
        description: "A valid plugin for testing",
      };
      if (isValidManifest(data)) {
        expect(data.name).toBe("my-plugin");
      }
    });
  });

  describe("agent paths registry", () => {
    it("contains all 7 agents", () => {
      const names = agentPaths.agents.map((a) => a.name);
      expect(names).toEqual(
        expect.arrayContaining([
          "claude",
          "codex",
          "opencode",
          "kimi",
          "gemini",
          "copilot",
          "pimono",
        ])
      );
    });

    it("every agent has skillPath and binary", () => {
      for (const agent of agentPaths.agents) {
        expect(agent.skillPath).toBeTruthy();
        expect(agent.binary).toBeTruthy();
      }
    });
  });
});
