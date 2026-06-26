/**
 * adapter-pimono index tests — B11
 *
 * Safety and codegen coverage for the Pi Mono adapter.
 */

import { describe, it, expect } from "vitest";
import type { PluginManifest } from "@agentplugins/core";
import { createPiMonoAdapter } from "../src/index";

const pluginRoot = "/tmp/fake-plugin";

function compile(manifest: PluginManifest) {
  return createPiMonoAdapter().compile(manifest, { pluginRoot });
}

function getIndexTs(output: ReturnType<typeof compile>) {
  return output.files.find((f) => f.path === "index.ts")?.content ?? "";
}

describe("adapter-pimono compile", () => {
  it("command handler injection safety — shell metachars stay inside JSON.stringify", () => {
    const manifest: PluginManifest = {
      name: "cmd-injection-test",
      version: "1.0.0",
      description: "Tests command handler escaping",
      hooks: {
        sessionStart: {
          handler: {
            type: "command",
            command: "node; rm -rf /",
          } as any,
        },
      },
    } as any;

    const output = compile(manifest);
    const code = getIndexTs(output);

    expect(code).toContain("node; rm -rf /");
    expect(code).toContain('const __cmdStr = "node; rm -rf /"');
    expect(code).not.toContain("`${");
    expect(code).not.toContain("shell: true");
    expect(code).toContain("__execSync(__cmdStr, {");
  });

  it("nativeEntry returns native copy metadata", () => {
    const manifest: PluginManifest = {
      name: "native-test",
      version: "1.0.0",
      description: "Tests native entry passthrough",
      nativeEntry: { pimono: "./custom-entry.ts" },
    } as any;

    const output = compile(manifest);

    expect(output.files).toHaveLength(0);
    expect(output.nativeCopies).toHaveLength(1);
    expect(output.nativeCopies![0].from).toBe("./custom-entry.ts");
    expect(output.nativeCopies![0].to).toBe("index.ts");
  });

  it("continueWith cap emits per-session iteration counter in stop block", () => {
    const manifest: PluginManifest = {
      name: "continue-test",
      version: "1.0.0",
      description: "Tests continueWith loop cap",
      hooks: {
        stop: {
          handler: {
            type: "inline",
            handler: async () => ({ continueWith: "keep going" }),
          } as any,
        },
      },
    } as any;

    const output = compile(manifest);
    const code = getIndexTs(output);

    expect(code).toContain("__continueWithCount");
    expect(code).toContain("__MAX_CONTINUE_WITH");
    expect(code).toMatch(/__continueWithCount\s*\>\s*20|__MAX_CONTINUE_WITH/);
  });

  it("path traversal — adapterOverrides.pimono is sanitized to stay inside pluginRoot", () => {
    const manifest: PluginManifest = {
      name: "override-traversal-test",
      version: "1.0.0",
      description: "Tests adapter override path sanitization",
      adapterOverrides: { pimono: "../evil.ts" },
    } as any;

    const output = compile(manifest);
    const code = getIndexTs(output);

    expect(code).not.toContain("../evil.ts");
    expect(code).not.toMatch(/['"]\.\.\/evil\.ts['"]/);
    expect(code).toContain("/tmp/fake-plugin/evil.ts");
  });

  it("path traversal — handler.source is sanitized for tools", () => {
    const manifest: PluginManifest = {
      name: "tool-source-test",
      version: "1.0.0",
      description: "Tests tool source path sanitization",
      tools: [
        {
          name: "escape",
          description: "escape",
          parameters: { type: "object", properties: {} },
          handler: { source: "../escape.ts", target: "default" } as any,
        },
      ],
    } as any;

    const output = compile(manifest);
    const code = getIndexTs(output);

    expect(code).not.toContain("../escape.ts");
    expect(code).toContain("/tmp/fake-plugin/escape.ts");
  });

  it("path traversal — handler.source is sanitized for commands", () => {
    const manifest: PluginManifest = {
      name: "command-source-test",
      version: "1.0.0",
      description: "Tests command source path sanitization",
      commands: [
        {
          name: "escape",
          handler: { source: "../escape.ts", target: "default" } as any,
        },
      ],
    } as any;

    const output = compile(manifest);
    const code = getIndexTs(output);

    expect(code).not.toContain("../escape.ts");
    expect(code).toContain("/tmp/fake-plugin/escape.ts");
  });

  it("path traversal — action.source is sanitized for shortcuts", () => {
    const manifest: PluginManifest = {
      name: "shortcut-source-test",
      version: "1.0.0",
      description: "Tests shortcut source path sanitization",
      shortcuts: [
        {
          key: "ctrl+e",
          command: "escape",
          action: { source: "../escape.ts", target: "default" } as any,
        },
      ],
    } as any;

    const output = compile(manifest);
    const code = getIndexTs(output);

    expect(code).not.toContain("../escape.ts");
    expect(code).toContain("/tmp/fake-plugin/escape.ts");
  });

  it("path traversal — handler.source is sanitized for flags", () => {
    const manifest: PluginManifest = {
      name: "flag-source-test",
      version: "1.0.0",
      description: "Tests flag source path sanitization",
      flags: [
        {
          name: "escape",
          handler: { source: "../escape.ts", target: "default" } as any,
        },
      ],
    } as any;

    const output = compile(manifest);
    const code = getIndexTs(output);

    expect(code).not.toContain("../escape.ts");
    expect(code).toContain("/tmp/fake-plugin/escape.ts");
  });

  it("emits a trust warning when dynamic imports are generated", () => {
    const manifest: PluginManifest = {
      name: "warning-test",
      version: "1.0.0",
      description: "Tests trust warning emission",
      tools: [
        {
          name: "warn",
          description: "warn",
          parameters: { type: "object", properties: {} },
          handler: { source: "./handlers/warn.ts", target: "default" } as any,
        },
      ],
    } as any;

    const output = compile(manifest);
    const code = getIndexTs(output);

    expect(code).toContain(
      "[agentplugins] Plugin loads external handler modules — only install plugins you trust"
    );
  });
});
