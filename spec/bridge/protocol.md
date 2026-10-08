# AnyHarness Bridge Protocol v0.1 — envelope, versioning, errors

> Status: **draft**. Companion docs: `operations.md`, `capabilities.md`,
> `transports.md`, `security.md`. Machine-readable message definitions:
> `messages.schema.json`.
>
> This document defines the wire contract. It does **not** define the store
> layout (`spec/store-layout.md`), the manifest format (`spec/manifest.md`),
> the lockfile (`spec/lockfile.md`), or the trust layer (`spec/trust.md`) —
> those are referenced by name only.

The bridge is **LSP-for-extensions**: one versioned JSON-RPC protocol. A
client harness (maki/lua, opencode/TS, fx/zig, hermes/py, crush/go, a
browser bundle) implements the client side once and gets the registry,
install, update, and trust layer "for free". The server side is `harness
serve` (or `@any-harness/sdk` in-process); per-language client SDKs are thin
generated wrappers over this document, not reimplementations.

## 1. Terminology

- **Client / host** — the agent harness. Initiates every request; owns the
  lifecycle of the server process (stdio) or the session (HTTP, in-process).
- **Server** — the AnyHarness bridge: `harness serve` or an in-process
  `Bridge` from `@any-harness/sdk`.
- **Session** — one negotiated conversation, from `capabilities.negotiate`
  until transport teardown.
- The key words **MUST**, **MUST NOT**, **SHOULD**, **MAY** are RFC 2119.

## 2. Message envelope — JSON-RPC 2.0

All messages are a single JSON object conforming to JSON-RPC 2.0
([jsonrpc.org/specification](https://www.jsonrpc.org/specification)), with
MCP/LSP conventions applied:

```jsonc
// Request
{ "jsonrpc": "2.0", "id": 7, "method": "extensions.list", "params": { "kinds": ["skill"] } }

// Response (success)
{ "jsonrpc": "2.0", "id": 7, "result": { "extensions": [] } }

// Response (error)
{ "jsonrpc": "2.0", "id": 7, "error": { "code": -32004, "message": "extension not found",
                                       "data": { "kind": "not-found", "resource": "extension" } } }

// Notification (no id, no response)
{ "jsonrpc": "2.0", "method": "events.notify", "params": { "kind": "extensions.changed" } }
```

Rules:

- `jsonrpc` MUST be the string `"2.0"`.
- `id` is a string or number chosen by the client, unique within the session
  among in-flight requests. Notifications have **no** `id` and MUST NOT be
  answered.
- `params` is always a **by-name object**; positional-parameter arrays are
  not used.
- `method` names are dot-namespaced (`<domain>.<verb>`). The complete v0.1
  operation set is defined in `operations.md`; unknown methods → `-32601`.
- **Batch requests are not supported in v0.1.** Each message is one
  request, response, or notification.
- Implementations MUST ignore unknown members on every object (forward
  compatibility) and MUST NOT depend on member ordering.
- A response carries `result` XOR `error`, never both.

## 3. Handshake and `protocolVersion` negotiation

### 3.1 Required first message

The client's first message on a new session MUST be a
`capabilities.negotiate` request. The server MUST reject every other
request received before negotiation with `-32002` (`handshake-required`).
Notifications from the server likewise MUST NOT be sent before negotiation.

### 3.2 Negotiation semantics

```jsonc
// → client
{ "jsonrpc": "2.0", "id": 1, "method": "capabilities.negotiate",
  "params": {
    "protocol": { "supported": ["0.1"] },
    "specs":    { "manifest": ["1.0"], "storeLayout": ["0.1"] },
    "client":   { "name": "maki", "version": "1.4.0" },
    "capabilities": { /* declared Capabilities — see capabilities.md */ }
  } }

// ← server
{ "jsonrpc": "2.0", "id": 1,
  "result": {
    "protocol": { "version": "0.1" },
    "specs":    { "manifest": "1.0", "storeLayout": "0.1" },
    "server":   { "name": "anyharness", "version": "2.0.0" },
    "session":  { "id": "ses_01J…" },
    "capabilities": { /* granted subset — see capabilities.md */ }
  } }
```

- `params.protocol.supported` is an array of protocol versions the client
  can speak, **newest first**. A version is a `"<major>.<minor>"` string.
- The server selects the **first entry in the client's list that it fully
  supports** and returns it in `result.protocol.version`. That value is the
  session's negotiated version; both sides MUST conform to it for the rest
  of the session.
- `params.specs` declares which versions of the **sibling L0 specs** the
  client understands, keyed by spec name: `manifest` (see
  `spec/manifest.md`), `storeLayout` (`spec/store-layout.md`),
  `lockfile` (`spec/lockfile.md`), `trust` (`spec/trust.md`). Each value is
  an array of spec versions, newest first, using the versioning policy
  defined in `spec/manifest.md` (referenced, not redefined here). The
  server answers with `result.specs` — the single negotiated version per
  spec — or omits a key it does not honor. A client that does not declare a
  spec key receives manifest/store documents only in the oldest spec
  version the server can emit.
- If the server supports **none** of the offered versions it MUST fail the
  request with `-32001` (`version-mismatch`) and include its own list:

  ```jsonc
  { "code": -32001, "message": "no common protocol version",
    "data": { "kind": "version-mismatch", "supported": ["0.1", "0.2"] } }
  ```

  The client MAY retry `capabilities.negotiate` with an intersecting list.
- The capability half of negotiation (which `ExtensionKind`s, hook events,
  and env slots both sides honor) is defined in `capabilities.md`. The
  returned `capabilities` object is the **granted** set — always a subset
  of, or equal to, what the client declared.
- `capabilities.negotiate` is invoked **exactly once** per session. A
  second call MUST fail with `-32602` (`invalid-params`).

### 3.3 Versioning policy

- Versions are `"<major>.<minor>"`. **Major** = breaking change; **minor**
  = strictly additive (new operations, new optional fields, new enum
  values).
- Clients and servers MUST ignore unknown fields, enum values, and
  notification kinds — this is what makes additive evolution safe.
- **Message schemas ride the protocol version.** `messages.schema.json` is
  published per protocol version and is not separately versioned on the
  wire: the negotiated `protocol.version` selects the whole schema bundle.
  Additive schema changes (new optional params, new enum members) ship in a
  minor bump; a field's meaning or requiredness changes only in a major
  bump.
- **Embedded documents version separately.** Payloads that carry sibling-
  spec documents (`plugin.json` manifests in `extensions.get`, skill trees
  in `skills.materialize`) follow the versioning policy of
  `spec/manifest.md` — referenced here by name, not redefined. Which of
  those spec versions is in force for the session is negotiated via
  `params.specs` / `result.specs` (§3.2), independently of the protocol
  version.
- **Pre-1.0 caveat:** while the major version is `0`, a minor bump MAY
  break compatibility. Pin the exact negotiated `version`; do not assume
  forward compat across `0.x` boundaries.

## 4. Error model

### 4.1 Shape

```jsonc
{ "code": <int>, "message": <string>, "data": { "kind": <string>, ... } }
```

- `code` selects the machine-readable class.
- `message` is a short human description; it MUST NOT carry the only copy
  of machine-relevant detail (that goes in `data`).
- `data.kind` is a stable, kebab-case error kind string. `data` MAY carry
  operation-specific fields (defined per op in `operations.md`).

### 4.2 Codes

Standard JSON-RPC codes are used unchanged:

| Code | Meaning |
| --- | --- |
| `-32700` | Parse error — malformed JSON |
| `-32600` | Invalid request — not a valid envelope |
| `-32601` | Method not found |
| `-32602` | Invalid params — schema violation |
| `-32603` | Internal error |

Bridge errors live in the `-32000…-32099` implementation-defined range:

| Code | `data.kind` | Raised when |
| --- | --- | --- |
| `-32001` | `version-mismatch` | No common `protocolVersion`; `data.supported` = server's list |
| `-32002` | `handshake-required` | Any request before `capabilities.negotiate` |
| `-32003` | `capability-unsupported` | Op/capability not granted by negotiation; `data.capability` names the missing slot |
| `-32004` | `not-found` | Named resource absent; `data.resource` ∈ `extension | command | skill | tool | server` |
| `-32005` | `manifest-invalid` | `plugin.json` fails `spec/manifest.md` validation; `data.issues` lists violations |
| `-32006` | `hook-failed` | A hook handler errored/timed out; `data.results` carries partial results |
| `-32007` | `policy-denied` | Trust/script policy refused the operation; `data.policy` names the rule (see `security.md`) |
| `-32008` | `trust-violation` | Integrity check failed (`extensions.lock` mismatch); `data.expected`, `data.actual` |
| `-32009` | `auth-failed` | Caller **authentication** failed (bad/missing bearer token on loopback; unknown peer on a socket) |
| `-32010` | `transport-unavailable` | Requested transport/mode not running (e.g. `tools.call` with no managed MCP) |
| `-32011` | `conflict` | Store mutation raced; retry is safe |
| `-32012` | `forbidden` | Caller **authenticated** but not authorized for this op on this server (`data.op` names the denied method; see `transports.md` §3, `security.md`) |

`auth-failed` vs `forbidden` mirrors HTTP 401/403: the former means "we
don't know who you are", the latter "we know who you are and the answer is
no". `capability-unsupported` is a third axis — the op is not in the
**negotiated feature set** regardless of identity.

## 5. Ordering and streaming

### 5.1 Ordering

- The stdio transport delivers messages **in order** per direction;
  HTTP and in-process transports preserve the same guarantee per session.
- Responses to **concurrent** requests MAY arrive in any order; `id` is
  the only correlation. A client MAY pipeline (send request N+1 before
  response N).
- The server MAY serialize store-mutating work internally; callers MUST NOT
  rely on two concurrent requests observing a consistent store snapshot.

### 5.2 Streaming hook results

`hooks.invoke` can be long-lived and multi-handler. When the request sets
`"stream": true`, the server streams intermediate progress as
`events.notify` notifications correlated by `streamId` — the client's own
request `id`, echoed as a string:

```jsonc
// request
{ "id": 42, "method": "hooks.invoke", "params": { "event": "tool.pre", "stream": true, "input": {…} } }

// streamed intermediates (any count, any order per handler)
{ "method": "events.notify", "params": { "streamId": "42", "kind": "hook.progress",
    "data": { "extension": "linter@1.2.0", "stage": "started" } } }
{ "method": "events.notify", "params": { "streamId": "42", "kind": "hook.delta",
    "data": { "extension": "linter@1.2.0", "chunk": "…" } } }

// terminal result arrives as the normal response
{ "id": 42, "result": { "status": "continue", "results": [ … ] } }
```

- The response (or error) for `id` is always the **terminal** message for
  that `streamId`; there is no separate "end" notification.
- Notifications correlated to a `streamId` the client did not issue MUST be
  ignored.
- When `"stream"` is absent or false, no `hook.progress`/`hook.delta`
  notifications are emitted for that request.

### 5.3 Cancellation

A client cancels an in-flight request by sending `events.notify` from the
client side — the only client→server use of `events.notify`:

```jsonc
{ "method": "events.notify", "params": { "kind": "request.cancelled",
    "data": { "requestId": "42" } } }
```

Cancellation follows the LSP/MCP shape adapted to our closed op set: the
server SHOULD abort the underlying work and MUST still answer the
cancelled request — either with its best-effort partial `result` or with
an error whose `data.kind` is `"request-cancelled"` (code `-32800`,
matching LSP's `RequestCancelled`).

| Code | `data.kind` | Raised when |
| --- | --- | --- |
| `-32800` | `request-cancelled` | Request aborted via `request.cancelled` |

## 6. Session lifecycle

```
spawn/connect → capabilities.negotiate (once) → steady state
                                                 ├─ client requests: extensions.*, hooks.invoke,
                                                 │   commands.resolve, skills.materialize, tools.call
                                                 └─ server notifications: events.notify
              → transport teardown (EOF / disconnect / dispose)
```

- Teardown ends the session. A reconnect is a **new** session and MUST
  re-negotiate.
- On stdio, server shutdown is stdin EOF; the server SHOULD exit `0` on
  clean EOF.
- Unanswered requests at teardown are considered failed transport errors
  on the client side, not protocol errors.
