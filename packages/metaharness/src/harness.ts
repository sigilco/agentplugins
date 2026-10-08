import type { LanguageModel, ModelMessage, TextStreamPart, ToolSet } from "ai";

import type { BridgeClient } from "./bridge.js";

/**
 * Static agent definition.
 * Maps to LangChain `createAgent` args / TanStack `defineAgent`.
 */
export interface AgentSpec {
  name: string;
  instructions?: string;
  tools?: ToolSet;
  /** Cap on model steps per run (default 16). */
  maxSteps?: number;
}

export interface StoragePort {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

/** BYOK: resolves user-held keys client-side; values must never reach a server. */
export interface SecretPort {
  resolve(name: string): string | undefined;
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Computer-only slot: process execution. Browser targets never inject it —
 * its absence is declared at `capabilities.negotiate`, not branched on inside
 * the core.
 */
export interface ExecPort {
  run(command: string): Promise<ExecResult>;
}

/**
 * Host-provided capabilities, injected per run and visible to every tool's
 * `execute` via the tool `context` option. Concrete shapes are owned by the
 * layers: `storage`/`secrets` by the host app, `bridge` by the AnyHarness
 * store host; `exec` is a computer-only slot.
 */
export interface Capabilities {
  storage?: StoragePort;
  secrets?: SecretPort;
  exec?: ExecPort;
  bridge?: BridgeClient;
}

export interface HarnessRunInput {
  agent: AgentSpec;
  /** Maps to LangChain `BaseChatModel` / a TanStack AI adapter. */
  model: LanguageModel;
  messages: ModelMessage[];
  capabilities?: Capabilities;
  signal?: AbortSignal;
}

/**
 * The seam host code binds to. `aiSdkHarness` is the only implementation
 * today; an alternative loop only has to emit the same AI-SDK-shaped parts —
 * the union covers text deltas, tool calls/results/errors, approval requests
 * and denials, step and run boundaries, abort and error.
 */
export interface AgentHarness {
  stream(input: HarnessRunInput): AsyncIterable<TextStreamPart<ToolSet>>;
}
