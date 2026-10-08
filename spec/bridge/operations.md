# AnyHarness Bridge Protocol v0.1 — operations

> The complete v0.1 operation set. Eight methods: one handshake, five
> resource ops, one streaming-capable invocation, one notification channel.
> Envelope, error codes, and lifecycle rules: `protocol.md`. Capability
> gating: `capabilities.md`. Wire framing: `transports.md`.
>
> Pinned shared types — `Extension`, `ExtensionKind`, `ManifestRef`,
> `Capabilities` — are defined in §1 and in `messages.schema.json`. Manifest
> document fields live in `spec/manifest.md`; store paths in
> `spec/store-layout.md`; integrity values in `spec/lockfile.md`. This doc
> references them by name only.

## 1. Pinned types (verbatim — parallel workstreams code against these)

```ts
type ExtensionKind = "skill" | "mcp" | "plugin" | "hook" | "command" | "agent" | "rule";

/** Pointer to a plugin.json + version, per spec/manifest.md + spec/lockfile.md. */
interface ManifestRef {
  /** Package name — `plugin.json` `name` field. */
  name: string;
  /** Exact installed version (semver string). */
  version: string;
  /** Integrity value as recorded in extensions.lock (e.g. "sha256-…"). Optional in-flight; always present server-side. */
  integrity?: string;
}

/** One installed unit in the store. */
interface Extension {
  /** Stable id: "<name>@<version>" — also the extensions.lock key. */
  id: string;
  /** Primary kind (how it was installed). */
  kind: ExtensionKind;
  manifest: ManifestRef;
  enabled: boolean;
  /** All kinds of content this extension contributes — a `plugin` may provide hooks+commands+skills. */
  provides?: ExtensionKind[];
  /** Whether the negotiated client can consume it (absent = true). */
  supported?: boolean;
}

/** Host-declared feature surface — see capabilities.md for slot semantics. */
interface Capabilities {
  /** ExtensionKind values this client can consume. */
  kinds: ExtensionKind[];
  /** Hook lifecycle events this client will invoke. */
  hookEvents: string[];
  /** Host-injected environment slots. */
  slots: {
    storage: "fs" | "kv" | "none";
    secrets: "host" | "prompt" | "none";
    exec: boolean;
    skills: "read-write" | "read" | "none";
    mcp: "managed" | "external" | "none";
    [slot: string]: unknown;  // forward-compatible extension slots
  };
  experimental?: Record<string, unknown>;
}
```

## 2. Lifecycle overview

| Phase | Client calls |
| --- | --- |
| Connect | `capabilities.negotiate` (once, first) |
| Session setup | `extensions.list`, `extensions.get`, `commands.resolve`, `skills.materialize` |
| Agent loop | `hooks.invoke` at each declared lifecycle event; `tools.call` for MCP work; `commands.resolve` on slash-command input |
| Steady state | server pushes `events.notify` (`extensions.changed`, `lock.changed`, `log`…) |
| Anytime | client pushes `events.notify` `request.cancelled` |

## 3. `capabilities.negotiate`

Handshake. Negotiates protocol version, sibling-spec versions, and the
feature surface. **Negotiates features, not permissions** — caller
authorization is enforced per-request by the transport's identity layer
(`transports.md` §3); an unauthorized op fails `-32012` regardless of what
was negotiated here.

**Params**

```ts
{
  protocol: { supported: string[] };          // newest first, e.g. ["0.1"]
  specs?: Record<string, string[]>;           // {"manifest": ["1.0"], "storeLayout": ["0.1"], …}
  client: { name: string; version: string };
  capabilities: Capabilities;                  // declared, not yet granted
}
```

**Result**

```ts
{
  protocol: { version: string };               // negotiated protocolVersion
  specs?: Record<string, string>;              // negotiated per-spec version
  server: { name: string; version: string };
  session: { id: string };
  capabilities: Capabilities;                  // granted subset
}
```

**Errors**: `-32001` version-mismatch (`data.supported`), `-32602` on a
second negotiate or schema violation.

**When**: exactly once, as the first message on every session and on every
reconnect.

## 4. `extensions.list`

Enumerate installed extensions visible to this client.

**Params**

```ts
{
  kinds?: ExtensionKind[];         // filter; matches primary kind OR provides[]
  includeUnsupported?: boolean;    // default false: kinds outside negotiated
                                   // capabilities are filtered out entirely
  enabledOnly?: boolean;           // default true
}
```

**Result**

```ts
{ extensions: Extension[] }        // each carries manifest: ManifestRef
```

**Errors**: none beyond the generic table; `-32003` never fires here —
filtering IS the graceful degradation.

**When**: after handshake, at session setup; re-call after an
`extensions.changed` notification.

## 5. `extensions.get`

Fetch one extension and its manifest document.

**Params** — exactly one selector:

```ts
{ id: string } | { manifest: ManifestRef }
```

**Result**

```ts
{
  extension: Extension;
  document: object;     // plugin.json per spec/manifest.md at the negotiated spec version
  files?: { path: string; size: number }[];  // relative to the package dir, per spec/store-layout.md
}
```

**Errors**: `-32004` not-found (`data.resource: "extension"`),
`-32005` manifest-invalid (`data.issues`).

**When**: lazily, for extensions the client actually consumes — do not
prefetch manifests for every list entry.

## 6. `hooks.invoke`

Run all installed handlers for one lifecycle event and return the merged
verdict. Streaming form: see `protocol.md` §5.2.

**Params**

```ts
{
  event: string;                    // a negotiated hookEvents entry
  input: object;                    // event payload — shape defined by the event (see capabilities.md §3)
  context?: {
    cwd?: string;
    session?: { id?: string; agent?: string };
    extension?: string;             // restrict to handlers from one extension
  };
  stream?: boolean;                 // default false → no progress notifications
  timeoutMs?: number;               // server default applies when omitted
}
```

**Result**

```ts
{
  status: "continue" | "modify" | "block";   // merged verdict: any "block" wins; else any "modify"; else "continue"
  output?: object;                           // merged modification payload when status === "modify"
  results: {
    extension: string;                       // Extension.id
    status: "continue" | "modify" | "block" | "skipped" | "error";
    output?: object;
    skippedReason?: "policy" | "capability" | "unsupported-event";
    durationMs?: number;
  }[];
}
```

**Errors**: `-32003` capability-unsupported (`data.capability` = the
undeclared event), `-32006` hook-failed (`data.results` carries the
per-handler partials), `-32007` policy-denied, `-32800` request-cancelled.
A single handler error never fails the whole call unless `failClosed` is
set by policy — it surfaces as `status: "error"` in `results` instead.

**When**: at every declared lifecycle event the agent loop reaches —
`session.start`, `prompt.submit`, `tool.pre`, `tool.post`,
`response.stop`, `session.end` (canonical list in `capabilities.md` §3).

## 7. `commands.resolve`

Resolve a slash command (or user-typed command string) to its definition
and expanded prompt.

**Params** — exactly one selector:

```ts
{ name: string; argv?: string[] } | { text: string }   // text is raw input, e.g. "/review src/"
```

**Result**

```ts
{
  command: {
    name: string;
    source: { extension: string; manifest: ManifestRef };
    description?: string;
    argv?: string[];             // declared positional args, if the manifest defines them
  };
  expansion: {
    prompt: string;              // fully-expanded prompt text to feed the agent loop
    context?: Record<string, string>;   // named captures the manifest declared
  };
}
```

**Errors**: `-32004` not-found (`data.resource: "command"`; `data.name`
echoes the lookup), `-32005` manifest-invalid.

**When**: whenever user input enters the harness's command namespace —
typically on a leading `/` or the harness's own command syntax.

## 8. `skills.materialize`

Make an installed skill usable by this client — written to the shared
store, or returned inline for filesystem-less hosts.

**Params**

```ts
{
  extension: string;              // Extension.id that provides skills
  target?: "store" | "inline";    // default "store"
  include?: string[];             // skill names to materialize; default = all provided
}
```

**Result**

```ts
{
  skills: {
    name: string;
    manifest: ManifestRef;
    files: { path: string; content?: string; contentBase64?: string }[];
    materializedTo?: string;      // absolute dir when target="store", e.g. "~/.agents/skills/<name>"
  }[];
}
```

**Semantics**

- `target: "store"` — the server writes the skill tree under
  `~/.agents/skills/` (rules in `spec/store-layout.md`). The client must
  have declared `slots.skills` = `"read"` or `"read-write"` — else the
  files land where the client can't see them and the server returns
  `-32003` instead of silently succeeding.
- `target: "inline"` — file contents are returned in `files[].content` /
  `contentBase64`; nothing is written. This is the browser/KV-host path.
- Writing into `~/.agents/plugins/` is NEVER a valid outcome (Codex's
  namespace — see `spec/store-layout.md`).

**Errors**: `-32003` capability-unsupported, `-32004` not-found
(`data.resource: "skill"`), `-32007` policy-denied, `-32008`
trust-violation (integrity mismatch while reading the package).

**When**: at session setup for skills the client wants resident, or
on-demand after `extensions.list`/`extensions.get` reveals a skill provider.

## 9. `tools.call`

MCP passthrough: invoke a tool on an MCP server the bridge manages
(`mcp.json` declarations per `spec/store-layout.md`).

**Params**

```ts
{
  server: string;                 // mcp.json server key
  tool: string;                   // MCP tool name
  arguments: object;              // tool arguments, passed through verbatim
  meta?: { progressToken?: string | number };   // MCP _meta passthrough
}
```

**Result** — the MCP `tools/call` result, verbatim:

```ts
{ content: object[]; isError?: boolean; structuredContent?: object; [k: string]: unknown }
```

**Errors**

- `-32003` capability-unsupported — negotiated `slots.mcp` was `"none"`,
  or the server runs without managed MCP (`data.capability: "mcp"`).
- `-32004` not-found — `data.resource: "server" | "tool"`.
- MCP protocol errors map to `-32603` with `data.kind: "mcp"` and the
  original MCP error object in `data.mcpError`. `isError: true` in a
  successful result is a *tool-level* failure and stays a result, not a
  JSON-RPC error.

**When**: inside the agent loop, whenever the model selects a tool owned
by a managed MCP server. Hosts with their own MCP client stack
(`slots.mcp: "external"`) MAY bypass the bridge entirely for tools — the
bridge op exists for hosts that don't run MCP themselves.

## 10. `events.notify`

Notification channel — no `id`, no response. The only bidirectional op:
server→client for everything, client→server for `request.cancelled` only.

**Params**

```ts
{ kind: string; data?: object; streamId?: string }
```

**Well-known kinds** (unknown kinds MUST be ignored):

| Kind | Direction | `data` |
| --- | --- | --- |
| `extensions.changed` | S→C | `{ added: string[]; removed: string[]; updated: string[] }` — Extension.ids; client should re-`extensions.list` |
| `lock.changed` | S→C | `{ path: string }` — extensions.lock rewritten externally |
| `hook.progress` | S→C | streamed intermediate, `streamId` = request id (`protocol.md` §5.2) |
| `hook.delta` | S→C | streamed output chunk, `streamId` = request id |
| `request.cancelled` | C→S | `{ requestId: string }` — cancel an in-flight request |
| `log` | S→C | `{ level: "debug"|"info"|"warn"|"error"; message: string }` — human diagnostics only |
| `store.warning` | S→C | `{ message: string; extension?: string }` — non-fatal store/trust issue |

**When**: `extensions.changed`/`lock.changed` whenever the store mutates
(including mutations by *other* clients in daemon mode — this is how
multi-harness coherency is announced); `log` at server discretion;
`request.cancelled` whenever the client abandons an in-flight request.
