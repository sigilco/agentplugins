import { jsonSchema, tool, type ToolSet } from "ai";

import type { ExtensionKind } from "./bridge.js";
import type { Capabilities } from "./harness.js";

const capabilitiesOf = (context: unknown): Capabilities | undefined =>
  typeof context === "object" && context !== null
    ? (context as Capabilities)
    : undefined;

const NO_BRIDGE =
  "bridge capability not injected — extension surfaces are unavailable on this target";
const NO_EXEC =
  "exec capability not injected — command execution is a computer-only slot";

const kindSchema = {
  type: "string",
  enum: ["skill", "mcp", "plugin", "hook", "command", "agent", "rule"],
} as const;

/**
 * Extension surfaces exposed to the model as AI SDK tools. Every `execute`
 * reads the injected `Capabilities` through `options.context` — nothing here
 * touches globals or the environment directly, so a browser target gets the
 * same tool surface with capability-degraded results.
 */
export const extensionTools = (): ToolSet => ({
  list_extensions: tool({
    description:
      "List extensions installed in the AnyHarness store " +
      "(skills, MCP servers, plugins, hooks, commands, agents, rules).",
    inputSchema: jsonSchema<{ kind?: ExtensionKind }>({
      type: "object",
      properties: { kind: kindSchema },
      additionalProperties: false,
    }),
    execute: async (input, options) => {
      const bridge = capabilitiesOf(options.context)?.bridge;
      if (!bridge) return { error: NO_BRIDGE };
      return bridge.call("extensions.list", input.kind ? { kind: input.kind } : undefined);
    },
  }),

  get_extension: tool({
    description: "Get one installed extension's manifest ref and metadata by name.",
    inputSchema: jsonSchema<{ name: string }>({
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    }),
    execute: async (input, options) => {
      const bridge = capabilitiesOf(options.context)?.bridge;
      if (!bridge) return { error: NO_BRIDGE };
      return bridge.call("extensions.get", { name: input.name });
    },
  }),

  call_extension_tool: tool({
    description:
      "Call a tool exposed by an installed extension " +
      "(bridge `tools.call` — MCP passthrough to managed servers).",
    inputSchema: jsonSchema<{ extension: string; tool: string; input?: unknown }>({
      type: "object",
      properties: {
        extension: { type: "string" },
        tool: { type: "string" },
        input: {},
      },
      required: ["extension", "tool"],
      additionalProperties: false,
    }),
    execute: async (input, options) => {
      const bridge = capabilitiesOf(options.context)?.bridge;
      if (!bridge) return { error: NO_BRIDGE };
      return bridge.call("tools.call", {
        extension: input.extension,
        tool: input.tool,
        input: input.input,
      });
    },
  }),

  resolve_command: tool({
    description:
      "Resolve a named harness command through the bridge " +
      "(bridge `commands.resolve`) and return its instructions.",
    inputSchema: jsonSchema<{ name: string; args?: string[] }>({
      type: "object",
      properties: {
        name: { type: "string" },
        args: { type: "array", items: { type: "string" } },
      },
      required: ["name"],
      additionalProperties: false,
    }),
    execute: async (input, options) => {
      const bridge = capabilitiesOf(options.context)?.bridge;
      if (!bridge) return { error: NO_BRIDGE };
      return bridge.call("commands.resolve", { name: input.name, args: input.args });
    },
  }),

  materialize_skill: tool({
    description:
      "Materialize an installed skill's instructions " +
      "(bridge `skills.materialize` — returns the SKILL.md body).",
    inputSchema: jsonSchema<{ name: string }>({
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    }),
    execute: async (input, options) => {
      const bridge = capabilitiesOf(options.context)?.bridge;
      if (!bridge) return { error: NO_BRIDGE };
      return bridge.call("skills.materialize", { name: input.name });
    },
  }),

  computer_exec: tool({
    description:
      "Run a shell command. Computer-only capability — returns an error " +
      "on targets that do not inject an exec slot (e.g. browser builds).",
    inputSchema: jsonSchema<{ command: string }>({
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
      additionalProperties: false,
    }),
    execute: async (input, options) => {
      const exec = capabilitiesOf(options.context)?.exec;
      if (!exec) return { error: NO_EXEC };
      return exec.run(input.command);
    },
  }),
});
