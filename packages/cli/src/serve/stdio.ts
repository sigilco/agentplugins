/**
 * stdio transport — spec/bridge/transports.md §1.
 *
 * Framing: newline-delimited JSON, one message per line on stdin/stdout;
 * stderr is free-form diagnostics. stdin EOF = shutdown → exit 0.
 *
 * Per line:
 *   1. JSON.parse — malformed → `-32700` parse-error response
 *   2. envelope check — non-request → `-32600` invalid-request
 *   3. authz — outside the caller's scope → `-32012` forbidden
 *   4. exec-policy gate — trust.md §4.1 `ask`→`exec.nonInteractive` in this
 *      non-interactive daemon context → `-32007` policy-denied
 *   5. dispatch → `handleBridgeRequest(store, req)` (sdk; owns handshake,
 *      method dispatch, and op semantics)
 *
 * Notifications (no `id`) are dispatched but never answered (protocol §2).
 * Anything the handler throws surfaces as `-32603` internal — a panic must
 * not kill the NDJSON loop.
 */
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  Store,
} from "../api.js";
import type { Policy, ServeCaller } from "../config.js";
import type { Logger } from "../output.js";
import { authorize } from "./authz.js";

export interface StdioServeOptions {
  store: Store;
  handleRequest: (store: Store, req: JsonRpcRequest) => Promise<JsonRpcResponse>;
  /** Caller entries from `[[serve.caller]]`; resolved by callerName. */
  callers: ServeCaller[];
  /** Caller name this transport resolved ("owner" on stdio). */
  callerName: string;
  policy: Policy;
  log: Logger;
  /** Input lines — one NDJSON message each. */
  lines: AsyncIterable<string>;
  /** Response sink — protocol messages only. */
  write: (line: string) => void;
}

const respond = (
  write: (line: string) => void,
  res: JsonRpcResponse,
): void => {
  write(JSON.stringify(res));
};

const errorRes = (
  id: string | number | null,
  code: number,
  kind: string,
  message: string,
  data?: Record<string, unknown>,
): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: { code, message, data: { kind, ...data } },
});

/** Ops that can drive executables — gated by the trust policy (§4.1). */
const EXEC_GATED: Record<string, keyof Pick<Policy, "execHooks" | "execMcp">> = {
  "hooks.invoke": "execHooks",
  "tools.call": "execMcp",
};

const policyGate = (
  method: string,
  policy: Policy,
): { denied: false } | { denied: true; policyKey: string } => {
  const key = EXEC_GATED[method];
  if (key === undefined) return { denied: false };
  const value = policy[key];
  if (value === "allow") return { denied: false };
  if (value === "deny") return { denied: true, policyKey: `exec.${key.slice(4).toLowerCase()}` };
  // "ask" with no TTY resolves to exec.nonInteractive (default deny).
  if (policy.execNonInteractive === "allow") return { denied: false };
  return { denied: true, policyKey: `exec.${key.slice(4).toLowerCase()}` };
};

const isNotification = (req: JsonRpcRequest): boolean => req.id === undefined;

export const serveStdio = async (opts: StdioServeOptions): Promise<void> => {
  const caller = opts.callers.find((c) => c.name === opts.callerName);

  for await (const raw of opts.lines) {
    const line = raw.trim();
    if (line === "") continue;

    let req: JsonRpcRequest;
    try {
      req = JSON.parse(line) as JsonRpcRequest;
    } catch {
      respond(opts.write, errorRes(null, -32700, "parse-error", "malformed JSON"));
      continue;
    }

    if (
      typeof req !== "object" ||
      req === null ||
      req.jsonrpc !== "2.0" ||
      typeof req.method !== "string"
    ) {
      respond(
        opts.write,
        errorRes(req?.id ?? null, -32600, "invalid-request", "not a JSON-RPC 2.0 envelope"),
      );
      continue;
    }

    const notification = isNotification(req);

    // Authorization — per request, before dispatch (transports.md §3.3).
    const authz = authorize(caller, req.method);
    if (!authz.ok) {
      opts.log.warn(
        `forbidden: caller "${opts.callerName}" attempted ${req.method}`,
      );
      if (!notification) {
        respond(
          opts.write,
          errorRes(req.id ?? null, -32012, "forbidden", "operation not permitted for this caller", {
            op: req.method,
          }),
        );
      }
      continue;
    }

    // Trust-policy gate — `ask` cannot prompt through a bridge session;
    // it resolves to exec.nonInteractive (deny by default) per trust.md §4.1.
    const gate = policyGate(req.method, opts.policy);
    if (gate.denied) {
      if (!notification) {
        respond(
          opts.write,
          errorRes(
            req.id ?? null,
            -32007,
            "policy-denied",
            `${req.method} refused by script policy (${gate.policyKey} → deny in non-interactive context)`,
            { policy: gate.policyKey },
          ),
        );
      }
      continue;
    }

    try {
      const res = await opts.handleRequest(opts.store, req);
      if (!notification) respond(opts.write, res);
    } catch (err) {
      opts.log.error(
        `handler threw on ${req.method}: ${err instanceof Error ? err.message : String(err)}`,
      );
      if (!notification) {
        respond(
          opts.write,
          errorRes(
            req.id ?? null,
            -32603,
            "internal",
            err instanceof Error ? err.message : "internal error",
          ),
        );
      }
    }
  }
};
