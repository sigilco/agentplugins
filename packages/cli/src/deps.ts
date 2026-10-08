/**
 * Everything a command needs that isn't argv — injected so tests run the
 * full command surface against an in-memory Store mock and never touch the
 * real sdk, filesystem, or TTY.
 */
import type {
  Actor,
  FsPort,
  JsonRpcRequest,
  JsonRpcResponse,
  SourceRef,
  Store,
} from "./api.js";
import type { Logger, OutWriters } from "./output.js";

export interface CliDeps {
  store: Store;
  resolveSource: (input: string) => SourceRef;
  handleBridgeRequest: (
    store: Store,
    req: JsonRpcRequest,
  ) => Promise<JsonRpcResponse>;
  /** Node ports — the cli owns these implementations. */
  fs: FsPort;
  w: OutWriters;
  log: Logger;
  env: Record<string, string | undefined>;
  /** Resolved agents root (`~/.agents`); the sdk owns `harness/` beneath it. */
  storeRoot: string;
  /** stdin is an interactive TTY (confirm prompts allowed). */
  interactive: boolean;
  actor: Actor;
  /**
   * Interactive y/N prompt on the controlling TTY. Only invoked when
   * `interactive` is true and `-y` was not passed; the cli wires a
   * hand-rolled readline prompt (no prompt libs — AGENTS.md §7).
   */
  confirm?: (question: string) => Promise<boolean>;
  /** Set the process exit code (doctor uses it to signal findings). */
  setExitCode: (code: number) => void;
}

/**
 * trust.md §4.2 actor classification: interactive TTY → `user`; anything
 * else (piped stdin, CI, agent-invoked) → `agent`; the bridge server is
 * `daemon`. `ANYHARNESS_ACTOR` overrides for tests/hosts that know better.
 */
export const detectActor = (
  env: Record<string, string | undefined>,
  interactive: boolean,
): Actor => {
  const forced = env.ANYHARNESS_ACTOR;
  if (forced === "user" || forced === "agent" || forced === "daemon") {
    return forced;
  }
  if (env.CI === "true" || env.CI === "1") return "agent";
  return interactive ? "user" : "agent";
};
