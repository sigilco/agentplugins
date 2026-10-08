import { describe, expect, it } from "vitest";

import { defaultPolicy, type Policy } from "./config.js";
import { authorize, STDIO_CALLER } from "./serve/authz.js";
import { serveStdio, type StdioServeOptions } from "./serve/stdio.js";
import { createLogger } from "./output.js";
import { createMockStore } from "./testing/mock-store.js";

const lines = async function* (input: string[]): AsyncIterable<string> {
  for (const l of input) yield l;
};

const run = async (
  input: string[],
  opts: {
    callers?: Parameters<typeof serveStdio>[0]["callers"];
    policy?: Policy;
    handle?: StdioServeOptions["handleRequest"];
  } = {},
) => {
  const written: string[] = [];
  const errs: string[] = [];
  await serveStdio({
    store: createMockStore(),
    handleRequest:
      opts.handle ??
      (async (_s, req) => ({
        jsonrpc: "2.0",
        id: req.id ?? null,
        result: { echoed: req.method },
      })),
    callers: opts.callers ?? [],
    callerName: STDIO_CALLER,
    policy: opts.policy ?? defaultPolicy(),
    log: createLogger({ out: () => {}, err: (s) => errs.push(s) }, "debug"),
    lines: lines(input),
    write: (l) => written.push(l),
  });
  return { written: written.map((l) => JSON.parse(l)), errs };
};

const req = (id: number, method: string, params = {}) =>
  JSON.stringify({ jsonrpc: "2.0", id, method, params });

describe("authorize", () => {
  it("grants everything to an unscoped caller (stdio owner)", () => {
    expect(authorize(undefined, "hooks.invoke")).toEqual({ ok: true });
    expect(authorize({ name: "owner" }, "tools.call")).toEqual({ ok: true });
  });

  it("auto-grants negotiate and notify", () => {
    const caller = { name: "x", allow: ["extensions.list"] };
    expect(authorize(caller, "capabilities.negotiate").ok).toBe(true);
    expect(authorize(caller, "events.notify").ok).toBe(true);
  });

  it("deny wins over allow; * allows all", () => {
    const caller = {
      name: "x",
      allow: ["*"],
      deny: ["tools.call"],
    };
    expect(authorize(caller, "tools.call")).toEqual({
      ok: false,
      op: "tools.call",
    });
    expect(authorize(caller, "extensions.list").ok).toBe(true);
  });

  it("scopes down sandboxed callers", () => {
    const caller = { name: "guest", allow: ["extensions.list"] };
    expect(authorize(caller, "extensions.list").ok).toBe(true);
    expect(authorize(caller, "skills.materialize")).toEqual({
      ok: false,
      op: "skills.materialize",
    });
  });
});

describe("serveStdio", () => {
  it("dispatches valid requests and writes responses", async () => {
    const { written } = await run([req(1, "extensions.list")]);
    expect(written).toEqual([
      { jsonrpc: "2.0", id: 1, result: { echoed: "extensions.list" } },
    ]);
  });

  it("answers malformed JSON with -32700", async () => {
    const { written } = await run(["{not json"]);
    expect(written[0].error.code).toBe(-32700);
    expect(written[0].error.data.kind).toBe("parse-error");
  });

  it("answers non-envelope input with -32600", async () => {
    const { written } = await run([JSON.stringify({ id: 1, method: "x" })]);
    expect(written[0].error.code).toBe(-32600);
  });

  it("enforces caller scope with -32012 before dispatch", async () => {
    let dispatched = 0;
    const { written } = await run([req(1, "hooks.invoke")], {
      callers: [{ name: "owner", allow: ["extensions.list"] }],
      handle: async (_s, r) => {
        dispatched += 1;
        return { jsonrpc: "2.0", id: r.id ?? null, result: {} };
      },
    });
    expect(dispatched).toBe(0);
    expect(written[0].error.code).toBe(-32012);
    expect(written[0].error.data).toMatchObject({
      kind: "forbidden",
      op: "hooks.invoke",
    });
  });

  it("policy gate: hooks.invoke denied when exec.hooks=deny", async () => {
    const { written } = await run([req(9, "hooks.invoke")], {
      policy: { ...defaultPolicy(), execHooks: "deny" },
    });
    expect(written[0].error.code).toBe(-32007);
    expect(written[0].error.data.policy).toBe("exec.hooks");
  });

  it("policy gate: ask resolves to exec.nonInteractive (deny default)", async () => {
    // exec.hooks = "ask" (default) + nonInteractive deny → -32007
    const { written } = await run([req(9, "hooks.invoke")]);
    expect(written[0].error.code).toBe(-32007);
    // …but allow lets it through to dispatch
    const ok = await run([req(9, "tools.call")], {
      policy: { ...defaultPolicy(), execMcp: "ask", execNonInteractive: "allow" },
    });
    expect(ok.written[0].result).toEqual({ echoed: "tools.call" });
  });

  it("notifications are dispatched but never answered", async () => {
    const seen: string[] = [];
    const { written } = await run(
      [JSON.stringify({ jsonrpc: "2.0", method: "events.notify", params: {} })],
      {
        handle: async (_s, r) => {
          seen.push(r.method);
          return { jsonrpc: "2.0", id: null, result: {} };
        },
      },
    );
    expect(seen).toEqual(["events.notify"]);
    expect(written).toHaveLength(0);
  });

  it("handler throws surface as -32603 without killing the loop", async () => {
    const { written } = await run(
      [req(1, "extensions.list"), req(2, "extensions.list")],
      {
        handle: async (_s, r) => {
          if (r.id === 1) throw new Error("boom");
          return { jsonrpc: "2.0", id: r.id ?? null, result: { ok: 1 } };
        },
      },
    );
    expect(written[0].error.code).toBe(-32603);
    expect(written[1].result).toEqual({ ok: 1 });
  });
});
