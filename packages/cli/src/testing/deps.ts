/** Test-side CliDeps factory — captures out/err, wires the mock store. */
import type { CliDeps } from "../deps.js";
import type { Store } from "../api.js";
import { createLogger } from "../output.js";
import { createMockStore, type MockStore } from "./mock-store.js";
import { createMemoryFs } from "./memory-fs.js";

export interface TestDeps {
  deps: CliDeps;
  store: MockStore;
  out: string[];
  err: string[];
  exitCode: number | undefined;
}

export const createTestDeps = (
  opts: {
    store?: Store;
    interactive?: boolean;
    actor?: CliDeps["actor"];
    confirm?: (q: string) => Promise<boolean>;
    env?: Record<string, string>;
    storeRoot?: string;
  } = {},
): TestDeps => {
  const out: string[] = [];
  const err: string[] = [];
  const store =
    opts.store !== undefined && "installs" in opts.store
      ? (opts.store as MockStore)
      : createMockStore();
  const state: { code: number | undefined } = { code: undefined };
  const w = { out: (s: string) => out.push(s), err: (s: string) => err.push(s) };
  const deps: CliDeps = {
    store: opts.store ?? store,
    resolveSource: (input) => {
      if (input.startsWith("local:")) {
        return { type: "local", uri: input.slice(6) };
      }
      if (input.includes("/") && !input.includes("://")) {
        return { type: "github", uri: input };
      }
      return { type: "git", uri: input };
    },
    handleBridgeRequest: async (_store, req) => ({
      jsonrpc: "2.0",
      id: req.id ?? null,
      result: { echoed: req.method },
    }),
    fs: createMemoryFs(),
    w,
    log: createLogger(w, "error"),
    env: opts.env ?? {},
    storeRoot: opts.storeRoot ?? "/test/.agents/harness",
    interactive: opts.interactive ?? false,
    actor: opts.actor ?? "user",
    confirm: opts.confirm,
    setExitCode: (code) => {
      state.code = code;
    },
  };
  return {
    deps,
    store,
    out,
    err,
    get exitCode() {
      return state.code;
    },
  };
};
