import {
  aiSdkHarness,
  extensionTools,
  type Capabilities,
} from "@any-harness/metaharness";
import type { LanguageModel, ModelMessage } from "ai";

export type TurnEvent =
  | { kind: "text"; text: string }
  | { kind: "tool-call"; tool: string; input: unknown }
  | { kind: "tool-result"; tool: string; output: unknown }
  | { kind: "finish" };

export interface TurnInput {
  model: LanguageModel;
  messages: ModelMessage[];
  capabilities: Capabilities;
  signal?: AbortSignal;
}

/** One agent turn through the metaharness, normalized for CLI display. */
export async function* streamTurn(input: TurnInput): AsyncIterable<TurnEvent> {
  const harness = aiSdkHarness();
  for await (const part of harness.stream({
    agent: {
      name: "playground",
      instructions:
        "You are the AnyHarness playground agent. Your extension surfaces " +
        "(list/get extensions, call extension tools, resolve commands, " +
        "materialize skills, exec) come through injected capabilities — use " +
        "them when asked; report plainly when a slot is unavailable.",
      tools: extensionTools(),
    },
    model: input.model,
    messages: input.messages,
    capabilities: input.capabilities,
    signal: input.signal,
  })) {
    if (part.type === "text-delta") {
      yield { kind: "text", text: part.text };
    } else if (part.type === "tool-call") {
      yield { kind: "tool-call", tool: part.toolName, input: part.input };
    } else if (part.type === "tool-result") {
      yield { kind: "tool-result", tool: part.toolName, output: part.output };
    } else if (part.type === "finish") {
      yield { kind: "finish" };
    }
  }
}
