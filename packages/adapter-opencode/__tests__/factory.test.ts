/**
 * factory.test.ts — TDD RED phase tests
 *
 * Tests for createOpenCodeAdapter() factory and module exports.
 * These tests define the expected behavior of the factory function
 * for the OpenCode adapter.
 */

import { describe, it, expect } from "vitest";
import type { PluginManifest, AdapterOutput } from "@agentplugin/core";
import { createOpenCodeAdapter, default as adapterInstance } from "../src/factory";

const EXPECTED_SUPPORTED_HOOKS = [
  "sessionStart",
  "sessionEnd",
  "preToolUse",
  "postToolUse",
  "permissionRequest",
  "notification",
  "preCompact",
  "stop",
] as const;

describe("createOpenCodeAdapter() factory", () => {
  it("returns an object with all PlatformAdapter properties", () => {
    const adapter = createOpenCodeAdapter();

    // name
    expect(adapter).toHaveProperty("name");
    expect(adapter.name).toBe("opencode");

    // displayName
    expect(adapter).toHaveProperty("displayName");
    expect(adapter.displayName).toBe("OpenCode");

    // supportedHooks
    expect(adapter).toHaveProperty("supportedHooks");
    expect(adapter.supportedHooks).toEqual(EXPECTED_SUPPORTED_HOOKS);
    expect(adapter.supportedHooks).toHaveLength(8);

    // supportedHandlers
    expect(adapter).toHaveProperty("supportedHandlers");
    expect(adapter.supportedHandlers).toEqual(["inline"]);

    // manifestPath — should be 'opencode.json', NOT '.opencode/plugins/'
    expect(adapter).toHaveProperty("manifestPath");
    expect(adapter.manifestPath).toBe("opencode.json");

    // manifestFormat
    expect(adapter).toHaveProperty("manifestFormat");
    expect(adapter.manifestFormat).toBe("json");

    // validate is a function
    expect(adapter).toHaveProperty("validate");
    expect(typeof adapter.validate).toBe("function");

    // compile is a function
    expect(adapter).toHaveProperty("compile");
    expect(typeof adapter.compile).toBe("function");
  });
});

describe("compile() returns proper AdapterOutput", () => {
  it("returns AdapterOutput with empty manifest (name and version only)", () => {
    const adapter = createOpenCodeAdapter();
    const manifest: PluginManifest = {
      name: "test-plugin",
      version: "1.0.0",
    };

    const output = adapter.compile(manifest);

    // files is an array of FileOutput
    expect(output).toHaveProperty("files");
    expect(Array.isArray(output.files)).toBe(true);
    expect(output.files.length).toBeGreaterThan(0);
    expect(output.files[0]).toHaveProperty("path");
    expect(output.files[0]).toHaveProperty("content");

    // manifest contains name and version
    expect(output).toHaveProperty("manifest");
    expect(output.manifest).toHaveProperty("name");
    expect(output.manifest).toHaveProperty("version");
    expect(output.manifest.name).toBe("test-plugin");
    expect(output.manifest.version).toBe("1.0.0");

    // warnings is an array
    expect(output).toHaveProperty("warnings");
    expect(Array.isArray(output.warnings)).toBe(true);

    // issues is an array
    expect(output).toHaveProperty("issues");
    expect(Array.isArray(output.issues)).toBe(true);

    // postInstall is an array of strings
    expect(output).toHaveProperty("postInstall");
    expect(Array.isArray(output.postInstall)).toBe(true);
    if (output.postInstall && output.postInstall.length > 0) {
      expect(typeof output.postInstall[0]).toBe("string");
    }
  });

  it("returns AdapterOutput with manifest containing hooks", () => {
    const adapter = createOpenCodeAdapter();
    const manifest: PluginManifest = {
      name: "my-plugin",
      version: "2.0.0",
      hooks: {
        preToolUse: {
          handler: {
            type: "inline",
            handler: async (ctx: unknown) => {
              return { block: false };
            },
          },
        },
      },
    };

    const output = adapter.compile(manifest);

    // files should include the plugin file and opencode.json
    expect(output.files.length).toBeGreaterThanOrEqual(2);

    // manifest should reflect the plugin name and version
    expect(output.manifest.name).toBe("my-plugin");
    expect(output.manifest.version).toBe("2.0.0");

    // issues should be empty (validation happens separately)
    expect(output.issues).toEqual([]);
  });
});

describe("default export equals createOpenCodeAdapter() result", () => {
  it("default export has same interface as createOpenCodeAdapter()", () => {
    const factoryInstance = createOpenCodeAdapter();

    // Same name
    expect(adapterInstance.name).toBe(factoryInstance.name);
    expect(adapterInstance.name).toBe("opencode");

    // Same displayName
    expect(adapterInstance.displayName).toBe(factoryInstance.displayName);
    expect(adapterInstance.displayName).toBe("OpenCode");

    // Same supportedHooks
    expect(adapterInstance.supportedHooks).toEqual(factoryInstance.supportedHooks);

    // Same supportedHandlers
    expect(adapterInstance.supportedHandlers).toEqual(factoryInstance.supportedHandlers);

    // Same manifestPath
    expect(adapterInstance.manifestPath).toBe(factoryInstance.manifestPath);

    // Same manifestFormat
    expect(adapterInstance.manifestFormat).toBe(factoryInstance.manifestFormat);

    // Both have validate and compile as functions
    expect(typeof adapterInstance.validate).toBe("function");
    expect(typeof adapterInstance.compile).toBe("function");
    expect(typeof factoryInstance.validate).toBe("function");
    expect(typeof factoryInstance.compile).toBe("function");
  });
});

describe("validate() method", () => {
  it("validate is callable and returns an array", () => {
    const adapter = createOpenCodeAdapter();
    const manifest: PluginManifest = {
      name: "test-plugin",
      version: "1.0.0",
    };

    const issues = adapter.validate(manifest);
    expect(Array.isArray(issues)).toBe(true);
  });
});
