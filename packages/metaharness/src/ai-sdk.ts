import { stepCountIs, ToolLoopAgent } from "ai";

import type { AgentHarness, HarnessRunInput } from "./harness.js";

const DEFAULT_MAX_STEPS = 16;

export const aiSdkHarness = (): AgentHarness => ({
  async *stream({ agent, model, messages, capabilities, signal }: HarnessRunInput) {
    // Per-run capabilities reach every tool's `execute` via `options.context`.
    const toolsContext = Object.fromEntries(
      Object.keys(agent.tools ?? {}).map((name) => [name, capabilities]),
    );
    const sdk = new ToolLoopAgent({
      model,
      instructions: agent.instructions,
      tools: agent.tools,
      stopWhen: stepCountIs(agent.maxSteps ?? DEFAULT_MAX_STEPS),
      // `toolsContext` is typed `never` for a schema-less ToolSet; the runtime
      // still forwards `toolsContext[toolName]` into `options.context`.
      toolsContext: toolsContext as never,
    });
    const result = await sdk.stream({ messages, abortSignal: signal });
    yield* result.fullStream;
  },
});
