# AnyHarness Bridge Protocol v0.1 — transports

> Three transports, one message schema (`messages.schema.json`). The
> transport carries bytes; the protocol in `protocol.md` is identical on
> all three — the only transport-visible difference is **how the caller is
> authenticated** (§3).

| Transport | Shape | Auth | Use |
| --- | --- | --- | --- |
| stdio | `harness serve` spawned per-host, NDJSON on stdin/stdout | OS process ownership | **Primary** — the MCP mental model |
| HTTP loopback | `harness serve --http`, `127.0.0.1`, bearer token | Per-caller token | Daemon mode (N harnesses, one store); **the only transport a browser context can reach** |
| in-process | `@any-harness/sdk` `createBridge()` | none — same address space | TS embeds, metaharness, browser bundle |

## 1. stdio (primary)

The host spawns and owns the server process:

```
harness serve            # or: harness serve --stdio
```

- **Framing**: newline-delimited JSON — one message per line, UTF-8, `\n`
  terminated. Messages MUST NOT contain literal newlines. This matches
  MCP's stdio framing (deliberately *not* LSP's `Content-Length` headers —
  NDJSON is greppable and stream-parsable in every language).
- **stdout** carries protocol messages only. **stderr** is free-form server
  diagnostics and MUST NOT be parsed.
- **Lifecycle**: one client per process. stdin EOF = shutdown → the server
  SHOULD exit `0`. Killing the process is always safe; in-flight requests
  just fail on the client side.
- **Environment**: the server inherits the host's environment (cwd, env
  vars). Optional overrides: `ANYHARNESS_STORE` (store root, default per
  `spec/store-layout.md`), `ANYHARNESS_LOG`.
- **Identity** (§3): the caller is *the parent process* — authentication is
  process ownership. No token exists to leak. Where the platform supports
  it (unix-domain variant of `harness serve`), peer credentials
  (`SO_PEERCRED`/`getpeereid`) MAY be recorded for the audit log
  (`spec/trust.md`); the peer is always authorized as the implicit
  `"owner"` caller with the full op set. A stdio server therefore does
  **not** implement per-caller scoping — one caller, all ops it negotiated.

This is the default every harness SHOULD implement first: spawn, negotiate,
go.

## 2. HTTP loopback (daemon + browser)

`harness serve --http` runs a long-lived server bound to **loopback only**.

### 2.1 Where it's needed — two distinct contexts

- **Daemon mode**: several local harnesses (a user's maki + opencode +
  crush) share one store through one server. Store mutations are serialized
  server-side; `extensions.changed`/`lock.changed` notifications keep the
  other clients coherent. This is the multi-tenancy case — callers are
  *different harnesses* and get different tokens (§3).
- **Browser contexts**: a web-hosted metaharness cannot spawn a process or
  open a unix socket; loopback HTTP is the only transport it can reach.
  Callers here are *web pages* — the token is a capability handed in
  explicitly (§2.4), and CORS/preflight rules apply.

The two contexts have different threat boundaries — see `security.md` §2
for the full analysis: a local socket relies on file-system perms and same-
uid isolation; bearer-token HTTP must additionally withstand DNS-rebinding
and any local process that can read `~/.agents/harness/serve.json`.

### 2.2 Framing

- `POST /rpc` — body is a single JSON-RPC message; response body is the
  single JSON-RPC response. `Content-Type: application/json`. Batch
  requests are not supported in v0.1.
- `GET /events` — optional SSE stream (`text/event-stream`) delivering
  `events.notify` notifications: `event: message`, `data:` = the full
  JSON-RPC notification object. Without an open `/events` stream,
  server→client notifications are silently dropped — request/response ops
  are unaffected.
- `GET /health` — unauthenticated `200 {"status":"ok","protocol":"0.1"}`;
  everything else requires auth (§2.4).

### 2.3 Port discovery

Default bind: `127.0.0.1:0` (ephemeral). Discovery file written on
successful bind:

```
~/.agents/harness/serve.json   # mode 0600, owned by the serving user
{
  "version": 1,
  "pid": 4177,
  "port": 55177,
  "token": "ahrt_…",            // bearer token, 256-bit random
  "protocol": "0.1",
  "startedAt": "2026-10-08T07:00:00Z"
}
```

Read order for local clients: `ANYHARNESS_HTTP` env var
(`http://127.0.0.1:PORT` — token still required), else
`~/.agents/harness/serve.json`, else `--port`/`--token` passed explicitly.
The file is removed on clean shutdown; a stale file (dead `pid`) MUST be
treated as absent. Token rotation = restart with `--rotate-token`, which
rewrites `serve.json` and invalidates prior tokens.

### 2.4 Authentication

Every request except `GET /health` requires:

```
Authorization: Bearer <token>
```

The token is the caller credential — possession *is* identity (see §3 for
how tokens map to callers). Browser clients cannot read `serve.json`; the
token reaches them by explicit hand-off: `harness serve --http
--print-token` output, user paste into the web app, or an enrollment URL
(`http://127.0.0.1:PORT/?token=…`) that the app stores itself. Failed auth
→ HTTP `401` with a JSON-RPC error body `-32009`/`auth-failed`.

TLS is intentionally **off** on loopback: the channel never leaves the
kernel, and the bearer token carries the security. (Why that's sufficient,
and the DNS-rebinding/`Host`-header rules the server MUST enforce, are in
`security.md` §2.)

## 3. Caller identity and authorization

`capabilities.negotiate` negotiates **features**; this section defines
**permissions** — who the caller is and which ops it may invoke. In daemon
mode N harnesses share one store, so the server MUST be able to tell them
apart and scope them differently.

### 3.1 Callers

A **caller** is a named principal the server knows:

```toml
# anyharness.toml (namespaced config per spec/store-layout.md)
[[serve.caller]]
name = "maki"                          # human label, audit log key
token = "ahrt_…"                       # bearer credential (stored hashed)
allow = ["extensions.list", "extensions.get", "commands.resolve",
         "skills.materialize", "tools.call", "events.notify",
         "capabilities.negotiate"]
# deny = ["hooks.invoke"]              # explicit denies also legal
```

- `allow`/`deny` are sets of bridge method names; `deny` wins on overlap.
  Omitted `allow` = full op set (the common single-user case).
- Wildcard `"*"` allowed in `allow` only (e.g. `allow = ["*"], deny =
  ["tools.call"]`).

### 3.2 Identity per transport

| Transport | Caller identity | Default scope |
| --- | --- | --- |
| stdio | `"owner"` — the spawning process; unix-socket variant MAY verify via peer creds | full op set (no scoping on stdio) |
| in-process | `"embed"` — same address space, no auth at all | full op set |
| HTTP loopback | one caller per bearer token in `serve.caller`; unknown/absent token → `-32009` | per-caller `allow`/`deny` |

- HTTP callers SHOULD also send `client.name` in `capabilities.negotiate`;
  when present the server SHOULD require it to match the token's `name`
  (prevents a leaked token silently impersonating a different harness in
  audit logs). Mismatch → `-32009`.
- Tokens are generated 256-bit random (`ahrt_` + base62). The server never
  echoes them in `events.notify`/`log`.

### 3.3 Enforcement

Authorization is checked **per request**, before dispatch:

- Method in the caller's `deny` or outside its `allow` → `-32012`
  `forbidden` with `data.op` naming the denied method. This is independent
  of capability negotiation: a sandboxed harness may negotiate a feature
  and still be refused the op.
- Caller-scoping errors are worth logging server-side; the response body
  reveals only that the op is denied, never the scope table.
- `capabilities.negotiate` itself MUST be in every caller's `allow` (the
  server auto-grants it); `events.notify` `request.cancelled` likewise.

Example sandboxed caller — a harness that may browse the store but never
run hooks or tools:

```toml
[[serve.caller]]
name = "sandboxed-guest"
token = "ahrt_…"
allow = ["extensions.list", "extensions.get"]
```

## 4. In-process binding

TS embeds link `@any-harness/sdk` directly — no serialization:

```ts
import { createBridge } from "@any-harness/sdk";

const bridge = await createBridge({ capabilities /* declared Capabilities */ });

const { extensions } = await bridge.call("extensions.list", { kinds: ["skill"] });
// or the typed facade:
const skills = await bridge.skills.materialize({ extension: "pkx@1.0.0", target: "inline" });

for await (const n of bridge.notifications()) { /* events.notify params */ }
await bridge.dispose();
```

- Method names, params, and results are the `messages.schema.json` types
  (exported as TS types from `@any-harness/spec`).
- JSON-RPC errors surface as thrown `BridgeError` carrying the same
  `code`/`data.kind`.
- Notifications arrive on `bridge.notifications()` (async iterator) or a
  callback — same `events.notify` shape.
- Negotiation still happens: `createBridge` performs the equivalent of
  `capabilities.negotiate` internally — same pins, no wire.

This binding is what the metaharness and any TS host (opencode-class) uses;
the same code path compiled into a browser bundle consumes the loopback
transport instead — same ops, different framing.
