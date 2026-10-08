/**
 * Bridge dispatch — `handleBridgeRequest(store, req, session?)` implements
 * the server side of spec/bridge (protocol.md envelope + §3 handshake,
 * operations.md op semantics, capabilities.md grant narrowing).
 *
 * Session state (negotiated caps, handshake latch, cancellation set) lives
 * in a `BridgeSession` — `createBridgeSession(store)` for multi-caller
 * transports (HTTP daemon); bare `handleBridgeRequest(store, req)` uses a
 * stable per-store default session, which is exactly the stdio/`harness
 * serve` shape: one process, one session.
 */

import { StoreError } from "./errors.js";
import { parseFrontmatter } from "./frontmatter.js";
import { listPackageFiles } from "./integrity.js";
import { join } from "./path.js";
import { resolveExecDecision } from "./policy.js";
import type { Store, StoreNotification } from "./store.js";
import type { Capabilities, Extension, ExtensionKind, ManifestRef } from "./types.js";
import { EXTENSION_KINDS } from "./types.js";

/* --------------------------- JSON-RPC types ------------------------- */

export type RequestId = string | number;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: RequestId;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: { kind: string } & Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: RequestId | null;
  result?: unknown;
  error?: JsonRpcError;
}

/** Pinned op names — plan + spec/bridge/operations.md. */
export const BRIDGE_OPS = [
  "capabilities.negotiate",
  "extensions.list",
  "extensions.get",
  "hooks.invoke",
  "commands.resolve",
  "skills.materialize",
  "tools.call",
  "events.notify",
] as const;
export type BridgeOp = (typeof BRIDGE_OPS)[number];

/* ------------------------------ errors ------------------------------ */

const err = (code: number, kind: string, message: string, data?: Record<string, unknown>): JsonRpcError => ({
  code,
  message,
  data: { kind, ...data },
});

const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;
const KIND_TO_CODE: Record<string, number> = {
  "version-mismatch": -32001,
  "handshake-required": -32002,
  "capability-unsupported": -32003,
  "not-found": -32004,
  "manifest-invalid": -32005,
  "hook-failed": -32006,
  "policy-denied": -32007,
  "trust-violation": -32008,
  "auth-failed": -32009,
  "transport-unavailable": -32010,
  conflict: -32011,
  forbidden: -32012,
  "request-cancelled": -32800,
  mcp: -32603,
};

const toRpcError = (e: unknown): JsonRpcError => {
  if (e instanceof StoreError)
    return err(KIND_TO_CODE[e.kind] ?? INTERNAL_ERROR, e.kind, e.message, e.data);
  if (e instanceof RpcError) return err(e.code, e.kind, e.message, e.data);
  return err(INTERNAL_ERROR, "internal", (e as Error)?.message ?? "internal error");
};

class RpcError extends Error {
  readonly code: number;
  readonly kind: string;
  readonly data?: Record<string, unknown>;
  constructor(code: number, kind: string, message: string, data?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.kind = kind;
    this.data = data;
  }
}

const invalidParams = (msg: string, data?: Record<string, unknown>): RpcError =>
  new RpcError(INVALID_PARAMS, "invalid-params", msg, data);
const capabilityUnsupported = (capability: string): RpcError =>
  new RpcError(-32003, "capability-unsupported", `capability not granted: ${capability}`, { capability });
const rpcNotFound = (resource: string, name?: string): RpcError =>
  new RpcError(-32004, "not-found", `${resource} not found${name ? `: ${name}` : ""}`, { resource, name });

/* ------------------------------ session ----------------------------- */

export const PROTOCOL_VERSIONS = ["0.1"] as const;
export const SERVER_NAME = "anyharness";
export const SERVER_SPEC_VERSIONS: Record<string, string[]> = {
  manifest: ["1.0"],
  storeLayout: ["0.1"],
  lockfile: ["0.1"],
  trust: ["0.1"],
};

/** Slot ceilings this server can grant (capabilities.md §1 ordering). */
const SLOT_CEILING: Record<string, string[] | "boolean"> = {
  storage: ["fs", "kv", "none"],
  secrets: ["host", "prompt", "none"],
  exec: "boolean",
  skills: ["read-write", "read", "none"],
  mcp: ["external", "none"], // no managed MCP in v0 — see report
};

export interface BridgeSession {
  negotiated: boolean;
  granted?: Capabilities;
  client?: { name: string; version: string };
  specs?: Record<string, string>;
  cancelled: Set<string>;
}

const defaultSessions = new WeakMap<Store, BridgeSession>();

export const createBridgeSession = (_store: Store): BridgeSession => ({
  negotiated: false,
  cancelled: new Set(),
});

const sessionFor = (store: Store, session?: BridgeSession): BridgeSession => {
  if (session) return session;
  let s = defaultSessions.get(store);
  if (!s) {
    s = createBridgeSession(store);
    defaultSessions.set(store, s);
  }
  return s;
};

/* --------------------------- capability grant ------------------------ */

const narrower = (declared: unknown, ceiling: string[] | "boolean"): unknown => {
  if (ceiling === "boolean") return declared === true;
  if (typeof declared !== "string") return ceiling[ceiling.length - 1];
  const di = ceiling.indexOf(declared);
  return di < 0 ? ceiling[ceiling.length - 1] : declared;
};

const grantCapabilities = (declared: Capabilities): Capabilities => {
  const kinds = (declared.kinds ?? []).filter((k) => EXTENSION_KINDS.includes(k));
  const slots: Capabilities["slots"] = {
    storage: narrower(declared.slots?.storage, SLOT_CEILING.storage) as Capabilities["slots"]["storage"],
    secrets: narrower(declared.slots?.secrets, SLOT_CEILING.secrets) as Capabilities["slots"]["secrets"],
    exec: narrower(declared.slots?.exec, SLOT_CEILING.exec) as boolean,
    skills: narrower(declared.slots?.skills, SLOT_CEILING.skills) as Capabilities["slots"]["skills"],
    mcp: narrower(declared.slots?.mcp, SLOT_CEILING.mcp) as Capabilities["slots"]["mcp"],
  };
  return { kinds, hookEvents: [...(declared.hookEvents ?? [])], slots };
};

const extensionSupported = (ext: Extension, granted: Capabilities): boolean =>
  granted.kinds.includes(ext.kind) ||
  (ext.provides ?? []).some((k) => granted.kinds.includes(k));

/* --------------------------------- ops -------------------------------- */

const p = (req: JsonRpcRequest): Record<string, unknown> =>
  (req.params ?? {}) as Record<string, unknown>;

const negotiate = (session: BridgeSession, params: Record<string, unknown>): unknown => {
  if (session.negotiated) throw invalidParams("capabilities.negotiate already completed for this session");
  const protocol = params["protocol"];
  const client = params["client"];
  const caps = params["capabilities"];
  if (typeof protocol !== "object" || protocol === null ||
      !Array.isArray((protocol as Record<string, unknown>)["supported"]))
    throw invalidParams("protocol.supported must be a non-empty array");
  const supported = (protocol as Record<string, unknown>)["supported"] as unknown[];
  const version = supported.find(
    (v): v is string => typeof v === "string" && (PROTOCOL_VERSIONS as readonly string[]).includes(v),
  );
  if (version === undefined)
    throw new RpcError(-32001, "version-mismatch", "no common protocol version", {
      supported: [...PROTOCOL_VERSIONS],
    });
  if (typeof client !== "object" || client === null)
    throw invalidParams("client {name,version} required");
  if (typeof caps !== "object" || caps === null)
    throw invalidParams("capabilities object required");

  const declared = caps as Capabilities;
  const granted = grantCapabilities(declared);

  const specsIn = (params["specs"] ?? {}) as Record<string, unknown>;
  const specsOut: Record<string, string> = {};
  for (const [spec, offered] of Object.entries(specsIn)) {
    const ours = SERVER_SPEC_VERSIONS[spec];
    if (!ours || !Array.isArray(offered)) continue;
    const pick = offered.find((v): v is string => typeof v === "string" && ours.includes(v));
    if (pick) specsOut[spec] = pick;
  }

  session.negotiated = true;
  session.granted = granted;
  session.client = client as { name: string; version: string };
  session.specs = specsOut;

  return {
    protocol: { version },
    specs: specsOut,
    server: { name: SERVER_NAME, version: "2.0.0" },
    session: { id: `ses_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}` },
    capabilities: granted,
  };
};

const extensionsList = async (store: Store, session: BridgeSession, params: Record<string, unknown>): Promise<unknown> => {
  const granted = session.granted!;
  const kinds = params["kinds"] as ExtensionKind[] | undefined;
  const includeUnsupported = params["includeUnsupported"] === true;
  const enabledOnly = params["enabledOnly"] !== false;
  const all = await store.list({ enabledOnly });
  const kindFiltered = kinds?.length
    ? all.filter((e) => kinds.includes(e.kind) || (e.provides ?? []).some((k) => kinds.includes(k)))
    : all;
  const extensions = kindFiltered
    .map((e) => {
      const supported = extensionSupported(e, granted);
      if (!supported && !includeUnsupported) return null;
      return supported ? e : { ...e, supported: false };
    })
    .filter((e): e is Extension => e !== null);
  return { extensions };
};

const extensionsGet = async (store: Store, session: BridgeSession, params: Record<string, unknown>): Promise<unknown> => {
  const granted = session.granted!;
  const lock = await store.readLock();
  let name: string | undefined;
  if (typeof params["id"] === "string") {
    const id = params["id"];
    const at = id.lastIndexOf("@");
    const candidate = at > 0 ? id.slice(0, at) : id;
    if (candidate in lock.extensions) name = candidate;
    else if (id in lock.extensions) name = id;
  } else if (typeof params["manifest"] === "object" && params["manifest"] !== null) {
    const m = params["manifest"] as ManifestRef;
    if (typeof m.name === "string" && m.name in lock.extensions) name = m.name;
  } else {
    throw invalidParams("exactly one selector required: id | manifest");
  }
  if (name === undefined) throw rpcNotFound("extension", JSON.stringify(params["id"] ?? params["manifest"]));
  const entry = lock.extensions[name];
  const ext = (await store.get(name)).extension;
  if (!extensionSupported(ext, granted)) throw capabilityUnsupported(`kinds:${ext.kind}`);

  // Manifest document: plugin.json verbatim; standalone skills synthesize one.
  let document: Record<string, unknown>;
  if (entry.kind === "skill" && entry.targets.includes("skills")) {
    const docPath = join((await store.get(name)).packageDir, "SKILL.md");
    let fmDoc: Record<string, unknown> = { name, version: entry.manifest.version };
    try {
      const text = new TextDecoder().decode(await store.ports.fs.readFile(docPath));
      const { frontmatter } = parseFrontmatter(text);
      fmDoc = { ...fmDoc, name: frontmatter["name"] ?? name, version: frontmatter["version"] ?? entry.manifest.version } as Record<string, unknown>;
    } catch { /* manifest read failure → synthetic ref */ }
    document = fmDoc;
  } else {
    const pkgDir = (await store.get(name)).packageDir;
    let text: string;
    try {
      text = new TextDecoder().decode(await store.ports.fs.readFile(join(pkgDir, "plugin.json")));
    } catch {
      throw new RpcError(-32005, "manifest-invalid", `plugin.json unreadable for ${name}`, { issues: ["read failure"] });
    }
    try {
      document = JSON.parse(text) as Record<string, unknown>;
    } catch (e) {
      throw new RpcError(-32005, "manifest-invalid", `plugin.json invalid for ${name}`, { issues: [(e as Error).message] });
    }
  }

  const files = await listPackageFiles(store.ports.fs, (await store.get(name)).packageDir);
  return { extension: ext, document, files };
};

/* hooks.invoke ------------------------------------------------------- */

interface HookRunResult {
  extension: string;
  status: "continue" | "modify" | "block" | "skipped" | "error";
  output?: Record<string, unknown>;
  skippedReason?: "policy" | "capability" | "unsupported-event";
  durationMs?: number;
}

const hooksInvoke = async (
  store: Store,
  session: BridgeSession,
  params: Record<string, unknown>,
  emit?: (n: StoreNotification) => void,
): Promise<unknown> => {
  const granted = session.granted!;
  const event = params["event"];
  const input = params["input"];
  if (typeof event !== "string" || event === "") throw invalidParams("event required");
  if (typeof input !== "object" || input === null) throw invalidParams("input object required");
  if (!granted.hookEvents.includes(event)) throw capabilityUnsupported(event);

  const context = (params["context"] ?? {}) as Record<string, unknown>;
  const onlyExtension = typeof context["extension"] === "string" ? context["extension"] : undefined;
  const stream = params["stream"] === true;
  const timeoutMs = typeof params["timeoutMs"] === "number" ? params["timeoutMs"] : undefined;
  const streamId = String(params["__id"] ?? "");

  const policy = await store.policy();
  const lock = await store.readLock();
  const results: HookRunResult[] = [];

  for (const [name, entry] of Object.entries(lock.extensions)) {
    if (entry.enabled === false) continue;
    const id = `${name}@${entry.manifest.version}`;
    if (onlyExtension !== undefined && onlyExtension !== id && onlyExtension !== name) continue;

    const pkgDir = (await store.get(name)).packageDir;
    const hooksPath = join(pkgDir, "dev.anyharness", "hooks.json");
    let hooksDoc: Record<string, unknown>;
    try {
      hooksDoc = JSON.parse(new TextDecoder().decode(await store.ports.fs.readFile(hooksPath)));
    } catch {
      continue; // no hooks.json → contributes nothing
    }
    const hooks = (hooksDoc as { hooks?: Record<string, unknown> })["hooks"];
    const entries = typeof hooks === "object" && hooks !== null ? hooks[event] : undefined;
    if (!Array.isArray(entries) || entries.length === 0) continue;

    for (const raw of entries) {
      const startedAt = Date.now();
      if (stream && emit)
        emit({ kind: "hook.progress", streamId, data: { extension: id, stage: "started" } });

      const cmd = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>)["command"] : undefined;
      if (typeof cmd !== "string") {
        results.push({ extension: id, status: "error" });
        continue;
      }

      // Trust gate: exec policy + slots.exec (capabilities.md §4.5).
      if (granted.slots.exec !== true) {
        results.push({ extension: id, status: "skipped", skippedReason: "policy" });
        continue;
      }
      const decision = resolveExecDecision(policy, "hooks", "daemon", entry.source);
      if (decision === "deny") {
        results.push({ extension: id, status: "skipped", skippedReason: "policy" });
        continue;
      }

      // `./`-prefixed commands resolve inside the package (containment §6.3).
      const command = cmd.startsWith("./") ? join(pkgDir, cmd.slice(2)) : cmd;
      const args = Array.isArray((raw as Record<string, unknown>)["args"])
        ? ((raw as Record<string, unknown>)["args"] as unknown[]).filter((a): a is string => typeof a === "string")
        : [];
      const dataDir = join(store.paths.data, name);
      const expandedArgs = args.map((a) =>
        a.replaceAll("${PLUGIN_ROOT}", pkgDir).replaceAll("${PLUGIN_DATA}", dataDir));
      const timeout = typeof (raw as Record<string, unknown>)["timeout"] === "number"
        ? ((raw as Record<string, unknown>)["timeout"] as number) * 1000
        : timeoutMs;

      try {
        const res = await store.ports.exec.run(command, expandedArgs, {
          cwd: pkgDir,
          env: { PLUGIN_ROOT: pkgDir, PLUGIN_DATA: dataDir },
          stdin: JSON.stringify({ event, input, context }),
          timeoutMs: timeout,
        });
        if (session.cancelled.has(streamId)) {
          results.push({ extension: id, status: "skipped", skippedReason: "capability" });
          continue;
        }
        if (res.code !== 0) {
          results.push({ extension: id, status: "error", durationMs: Date.now() - startedAt });
          continue;
        }
        let parsed: { status?: string; output?: Record<string, unknown> } = {};
        try {
          parsed = JSON.parse(res.stdout) as typeof parsed;
        } catch {
          parsed = { status: "continue" };
        }
        const status = parsed.status === "block" || parsed.status === "modify" ? parsed.status : "continue";
        results.push({
          extension: id,
          status,
          output: parsed.output,
          durationMs: Date.now() - startedAt,
        });
        if (stream && emit && typeof parsed.output?.["delta"] === "string")
          emit({ kind: "hook.delta", streamId, data: { extension: id, chunk: parsed.output["delta"] } });
      } catch {
        results.push({ extension: id, status: "error", durationMs: Date.now() - startedAt });
      }
    }
  }

  const merged = results.some((r) => r.status === "block")
    ? "block"
    : results.some((r) => r.status === "modify")
      ? "modify"
      : "continue";
  const output = merged === "modify"
    ? Object.assign({}, ...results.filter((r) => r.status === "modify").map((r) => r.output ?? {}))
    : undefined;
  return { status: merged, output, results };
};

/* commands.resolve ---------------------------------------------------- */

const commandsResolve = async (store: Store, _session: BridgeSession, params: Record<string, unknown>): Promise<unknown> => {
  let name: string | undefined;
  let argv: string[] | undefined;
  if (typeof params["name"] === "string") {
    name = params["name"];
    argv = Array.isArray(params["argv"])
      ? (params["argv"] as unknown[]).filter((a): a is string => typeof a === "string")
      : undefined;
  } else if (typeof params["text"] === "string") {
    const text = params["text"].trim().replace(/^\//, "");
    const tokens = text.split(/\s+/).filter(Boolean);
    name = tokens.shift();
    argv = tokens;
  } else {
    throw invalidParams("exactly one selector required: name | text");
  }
  if (!name) throw invalidParams("empty command name");

  const lock = await store.readLock();
  for (const [extName, entry] of Object.entries(lock.extensions)) {
    if (entry.enabled === false) continue;
    if (!entry.components?.some((c) => c.kind === "command" && c.name === name)) continue;
    const pkgDir = (await store.get(extName)).packageDir;
    const dir = join(pkgDir, "dev.anyharness", "commands");
    let candidates: string[] = [];
    try {
      candidates = (await store.ports.fs.readDir(dir))
        .filter((e) => e.type === "file" && e.name.endsWith(".md"))
        .map((e) => join(dir, e.name));
    } catch {
      continue;
    }
    for (const mdPath of candidates) {
      let text: string;
      try {
        text = new TextDecoder().decode(await store.ports.fs.readFile(mdPath));
      } catch {
        continue;
      }
      const { frontmatter, body } = parseFrontmatter(text);
      const stem = mdPath.slice(mdPath.lastIndexOf("/") + 1).replace(/\.md$/, "");
      const declared = typeof frontmatter["name"] === "string" ? frontmatter["name"] : stem;
      if (declared !== name && stem !== name) continue;
      return {
        command: {
          name,
          source: { extension: `${extName}@${entry.manifest.version}`, manifest: entry.manifest },
          description:
            typeof frontmatter["description"] === "string" ? frontmatter["description"] : undefined,
          argv,
        },
        expansion: { prompt: body }, // body verbatim per manifest.md §5.2
      };
    }
  }
  throw rpcNotFound("command", name);
};

/* skills.materialize -------------------------------------------------- */

const skillsMaterialize = async (store: Store, session: BridgeSession, params: Record<string, unknown>): Promise<unknown> => {
  const granted = session.granted!;
  const extId = params["extension"];
  if (typeof extId !== "string" || extId === "") throw invalidParams("extension id required");
  const target = params["target"] === "inline" ? "inline" : "store";
  const include = Array.isArray(params["include"])
    ? (params["include"] as unknown[]).filter((s): s is string => typeof s === "string")
    : undefined;

  if (target === "store") {
    const skillsSlot = granted.slots.skills;
    if (skillsSlot !== "read" && skillsSlot !== "read-write")
      throw capabilityUnsupported("skills");
    if (granted.slots.storage !== "fs") throw capabilityUnsupported("storage");
  }

  const res = await store.materialize(extId, { target, include, actor: "daemon" });
  return { skills: res.skills };
};

/* tools.call ----------------------------------------------------------- */

const toolsCall = async (store: Store, session: BridgeSession, params: Record<string, unknown>): Promise<unknown> => {
  const granted = session.granted!;
  if (granted.slots.mcp !== "managed")
    throw capabilityUnsupported("mcp");
  const server = params["server"];
  const tool = params["tool"];
  const args = params["arguments"];
  if (typeof server !== "string" || typeof tool !== "string" || typeof args !== "object" || args === null)
    throw invalidParams("server, tool, arguments required");
  const mcp = store.ports.mcp;
  if (mcp === undefined)
    throw new RpcError(-32010, "transport-unavailable", "no managed MCP runtime on this server", { capability: "mcp" });
  try {
    return await mcp.call(server, tool, args as Record<string, unknown>, params["meta"] as Record<string, unknown> | undefined);
  } catch (e) {
    const mcpError = typeof e === "object" && e !== null ? e : { message: String(e) };
    throw new RpcError(-32603, "mcp", "MCP tool call failed", { mcpError });
  }
};

/* ------------------------------- dispatch ---------------------------- */

/**
 * Pinned dispatcher. `session` is optional: transports serving many
 * sessions (HTTP daemon) pass one per connection; stdio/in-process use
 * the per-store default — one process, one negotiation.
 *
 * Notifications (`"id" absent`) are handled but MUST NOT be answered by
 * the transport — the returned response is a discardable placeholder.
 */
export async function handleBridgeRequest(
  store: Store,
  req: JsonRpcRequest,
  session?: BridgeSession,
  emit?: (n: StoreNotification) => void,
): Promise<JsonRpcResponse> {
  const id = req.id ?? null;
  const sess = sessionFor(store, session);

  const fail = (e: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, error: toRpcError(e) });

  if (req === null || typeof req !== "object" || req.jsonrpc !== "2.0" || typeof req.method !== "string")
    return fail(new RpcError(INVALID_REQUEST, "invalid-request", "not a JSON-RPC 2.0 envelope"));

  // Notifications: no id → never answered (protocol.md §2). The only
  // client→server kind honored is request.cancelled; others are ignored.
  if (req.id === undefined) {
    if (req.method === "events.notify") {
      const params = p(req);
      if (params["kind"] === "request.cancelled") {
        const rid = (params["data"] as Record<string, unknown> | undefined)?.["requestId"];
        if (rid !== undefined) sess.cancelled.add(String(rid));
      }
    }
    return { jsonrpc: "2.0", id: null, result: { ok: true } };
  }

  if (!(BRIDGE_OPS as readonly string[]).includes(req.method))
    return fail(new RpcError(METHOD_NOT_FOUND, "method-not-found", `unknown method: ${req.method}`));

  if (req.method !== "capabilities.negotiate" && !sess.negotiated)
    return fail(new RpcError(-32002, "handshake-required", "capabilities.negotiate must be the first request"));

  try {
    const params = p(req);
    params["__id"] = id; // internal: lets hooks.invoke correlate streamId
    let result: unknown;
    switch (req.method) {
      case "capabilities.negotiate": result = negotiate(sess, params); break;
      case "extensions.list": result = await extensionsList(store, sess, params); break;
      case "extensions.get": result = await extensionsGet(store, sess, params); break;
      case "hooks.invoke": result = await hooksInvoke(store, sess, params, emit); break;
      case "commands.resolve": result = await commandsResolve(store, sess, params); break;
      case "skills.materialize": result = await skillsMaterialize(store, sess, params); break;
      case "tools.call": result = await toolsCall(store, sess, params); break;
      case "events.notify": result = { ok: true }; break;
      default: result = undefined;
    }
    return { jsonrpc: "2.0", id, result };
  } catch (e) {
    return fail(e);
  }
}
