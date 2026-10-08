/**
 * Bridge protocol v0.1 — client-side surface.
 *
 * The bridge is the versioned JSON-RPC slot between a harness and an
 * AnyHarness store host. Three transports are planned (stdio primary, HTTP
 * loopback, in-process); this package ships the in-process binding only —
 * the same `BridgeClient` shape a stdio/HTTP client will satisfy.
 *
 * NOTE: `Extension` / `ExtensionKind` / `ManifestRef` are interface pins from
 * `.agents/plans/2026-10-07-v2-foundation.md`. `@any-harness/spec` will own
 * the canonical schemas once W2/W3 land; keep these structurally aligned.
 */

export type ExtensionKind =
  | "skill"
  | "mcp"
  | "plugin"
  | "hook"
  | "command"
  | "agent"
  | "rule";

/** Pointer to an installed unit's `plugin.json` + resolved version. */
export interface ManifestRef {
  /** Path or URI to the manifest (e.g. `~/.agents/harness/<name>/plugin.json`). */
  manifest: string;
  /** Pinned version when resolved through the lockfile. */
  version?: string;
}

/** Installed unit. */
export interface Extension {
  name: string;
  kind: ExtensionKind;
  ref: ManifestRef;
  enabled?: boolean;
  description?: string;
}

/** Operation table: wire name → params/result pair. */
export interface BridgeOps {
  "capabilities.negotiate": {
    params: { protocolVersion: string; capabilities: string[] };
    result: { protocolVersion: string; granted: string[]; denied: string[] };
  };
  "extensions.list": {
    params: { kind?: ExtensionKind } | undefined;
    result: { extensions: Extension[] };
  };
  "extensions.get": {
    params: { name: string };
    result: { extension: Extension | null };
  };
  "hooks.invoke": {
    params: { hook: string; event: string; payload?: unknown };
    result: { ok: boolean; output?: unknown };
  };
  "commands.resolve": {
    params: { name: string; args?: string[] };
    result: { resolved: boolean; instructions?: string };
  };
  "skills.materialize": {
    params: { name: string };
    result: { found: boolean; content?: string };
  };
  /** MCP passthrough to managed servers. */
  "tools.call": {
    params: { extension: string; tool: string; input?: unknown };
    result: { output?: unknown; error?: string };
  };
  "events.notify": {
    params: { event: string; payload?: unknown };
    result: { ok: boolean };
  };
}

export type BridgeOp = keyof BridgeOps;

export const BRIDGE_OPS: readonly BridgeOp[] = [
  "capabilities.negotiate",
  "extensions.list",
  "extensions.get",
  "hooks.invoke",
  "commands.resolve",
  "skills.materialize",
  "tools.call",
  "events.notify",
];

/** One callable op, whatever the transport underneath. */
export interface BridgeClient {
  call<Op extends BridgeOp>(
    op: Op,
    params: BridgeOps[Op]["params"],
  ): Promise<BridgeOps[Op]["result"]>;
}

export class BridgeError extends Error {
  readonly op: BridgeOp;
  constructor(op: BridgeOp, message: string) {
    super(`bridge ${op}: ${message}`);
    this.name = "BridgeError";
    this.op = op;
  }
}

export type BridgeHandlers = {
  [Op in BridgeOp]?: (
    params: BridgeOps[Op]["params"],
  ) => Promise<BridgeOps[Op]["result"]> | BridgeOps[Op]["result"];
};

/**
 * In-process transport: a `BridgeClient` bound directly to a host's handler
 * table — no serialization. Used by TS embeds, the browser build, and tests.
 * Missing ops raise `BridgeError`; host surfaces stay opt-in per op.
 */
export const inProcessBridge = (handlers: BridgeHandlers): BridgeClient => ({
  call: async (op, params) => {
    const handler = handlers[op];
    if (!handler) {
      throw new BridgeError(op, "op not implemented by this host");
    }
    // Params/result are per-op typed; dispatch is unchecked by construction.
    return (handler as (p: unknown) => unknown)(params) as never;
  },
});
