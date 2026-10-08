import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { jsonSchema, tool } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";

import { aiSdkHarness } from "./ai-sdk.js";
import { inProcessBridge, type Extension } from "./bridge.js";
import type { Capabilities } from "./harness.js";
import { extensionTools } from "./tools.js";

const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

const textParts = (delta: string): LanguageModelV4StreamPart[] => [
  { type: "stream-start" as const, warnings: [] },
  { type: "text-start" as const, id: "1" },
  { type: "text-delta" as const, id: "1", delta },
  { type: "text-end" as const, id: "1" },
  { type: "finish" as const, finishReason: { unified: "stop" as const, raw: undefined }, usage },
];

const toolCallThenText = (
  toolName: string,
  input: string,
  calls: { n: number },
): LanguageModelV4StreamPart[] =>
  calls.n++ === 0
    ? [
        { type: "stream-start" as const, warnings: [] },
        { type: "tool-call" as const, toolCallId: "c1", toolName, input },
        {
          type: "finish" as const,
          finishReason: { unified: "tool-calls" as const, raw: undefined },
          usage,
        },
      ]
    : textParts("done");

const collect = async (input: Parameters<ReturnType<typeof aiSdkHarness>["stream"]>[0]) => {
  const parts = [];
  for await (const part of aiSdkHarness().stream(input)) parts.push(part);
  return parts;
};

const demoExtensions: Extension[] = [
  { name: "commit-smith", kind: "skill", ref: { manifest: "~/.agents/skills/commit-smith/SKILL.md" } },
  { name: "echo-mcp", kind: "mcp", ref: { manifest: "~/.agents/harness/echo-mcp/plugin.json", version: "0.1.0" } },
];

describe("aiSdkHarness", () => {
  it("streams model text through to the caller", async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({ stream: convertArrayToReadableStream(textParts("hello")) }),
    });

    const parts = await collect({
      agent: { name: "test" },
      model,
      messages: [{ role: "user", content: "hi" }],
    });

    const deltas = parts.filter((p) => p.type === "text-delta");
    expect(deltas.map((p) => (p.type === "text-delta" ? p.text : ""))).toEqual(["hello"]);
    expect(parts.at(-1)?.type).toBe("finish");
  });

  it("injects capabilities into tool execute via the tool context", async () => {
    const capabilities: Capabilities = { storage: { get: async () => null, set: async () => {}, delete: async () => {} } };
    let seenContext: unknown;
    const calls = { n: 0 };

    const echo = tool({
      description: "echo the value",
      inputSchema: jsonSchema<{ v: string }>({
        type: "object",
        properties: { v: { type: "string" } },
        required: ["v"],
        additionalProperties: false,
      }),
      execute: (input, options) => {
        seenContext = options.context;
        return Promise.resolve(input.v);
      },
    });

    const model = new MockLanguageModelV4({
      doStream: () =>
        Promise.resolve({
          stream: convertArrayToReadableStream(toolCallThenText("echo", JSON.stringify({ v: "x" }), calls)),
        }),
    });

    const parts = await collect({
      agent: { name: "test", tools: { echo } },
      model,
      messages: [{ role: "user", content: "use echo" }],
      capabilities,
    });

    expect(calls.n).toBe(2);
    expect(parts.map((p) => p.type)).toEqual(
      expect.arrayContaining(["tool-call", "tool-result", "finish"]),
    );
    expect(seenContext).toBe(capabilities);
  });

  it("wires bridge extension surfaces into tools", async () => {
    const calls = { n: 0 };
    const bridge = inProcessBridge({
      "extensions.list": (params) =>
        Promise.resolve({
          extensions: params?.kind
            ? demoExtensions.filter((e) => e.kind === params.kind)
            : demoExtensions,
        }),
    });

    const model = new MockLanguageModelV4({
      doStream: () =>
        Promise.resolve({
          stream: convertArrayToReadableStream(
            toolCallThenText("list_extensions", JSON.stringify({ kind: "skill" }), calls),
          ),
        }),
    });

    const parts = await collect({
      agent: { name: "test", tools: extensionTools() },
      model,
      messages: [{ role: "user", content: "list skills" }],
      capabilities: { bridge },
    });

    const result = parts.find((p) => p.type === "tool-result");
    expect(result && result.type === "tool-result" ? result.output : undefined).toEqual({
      extensions: [demoExtensions[0]],
    });
  });

  it("degrades computer-only slots instead of failing when capabilities are absent", async () => {
    const calls = { n: 0 };
    const model = new MockLanguageModelV4({
      doStream: () =>
        Promise.resolve({
          stream: convertArrayToReadableStream(
            toolCallThenText("computer_exec", JSON.stringify({ command: "ls" }), calls),
          ),
        }),
    });

    const parts = await collect({
      agent: { name: "test", tools: extensionTools() },
      model,
      messages: [{ role: "user", content: "run ls" }],
      // No exec, no bridge: browser-shaped capability set.
    });

    const result = parts.find((p) => p.type === "tool-result");
    expect(result && result.type === "tool-result" ? result.output : undefined).toMatchObject({
      error: expect.stringContaining("computer-only"),
    });
  });
});
