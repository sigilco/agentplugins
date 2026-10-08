# AnyHarness Bridge Protocol v0.1 — capability model

> `Capabilities` is the IR that makes one protocol serve a browser tab and
> a native CLI alike. A client declares its surface at
> `capabilities.negotiate`; the server grants a subset; everything outside
> the grant degrades by rule, never by `#ifdef`. Envelope/handshake:
> `protocol.md`; per-op gating: `operations.md`.
>
> **Feature negotiation ≠ authorization.** `Capabilities` describes what a
> client *can consume*. Whether an authenticated caller *may* invoke an op
> is the identity/scope layer in `transports.md` §3 and `security.md` —
> orthogonally enforced, orthogonal failure (`-32012` vs `-32003`).

## 1. The `Capabilities` shape (pinned)

```ts
interface Capabilities {
  /** ExtensionKind values this client can consume. */
  kinds: ExtensionKind[];              // subset of "skill|mcp|plugin|hook|command|agent|rule"
  /** Canonical hook lifecycle events this client will invoke (§3). */
  hookEvents: string[];
  /** Host-injected environment slots (§2). */
  slots: {
    storage: "fs" | "kv" | "none";
    secrets: "host" | "prompt" | "none";
    exec: boolean;
    skills: "read-write" | "read" | "none";
    mcp: "managed" | "external" | "none";
    [slot: string]: unknown;           // extension slots, namespaced — §4
  };
  experimental?: Record<string, unknown>;
}
```

Negotiation result (`result.capabilities`) is the **granted** set — the
server MAY narrow any field (fewer kinds, fewer events, weaker slot
values). Slot strengths are ordered: `none < kv < fs`, `none < prompt <
host`, `none < read < read-write`, `none < external < managed`. The client
MUST treat anything absent from the grant as unsupported.

## 2. Environment slots

`slots` describes the host environment the client runs in — the same
object the metaharness's capability-injection pattern uses internally
(storage/secrets/exec/skills/mcp). The bridge lets a *remote* client make
the same declarations a linked-in `Bridge` would.

| Slot | Values | Semantics |
| --- | --- | --- |
| `storage` | `fs` / `kv` / `none` | `fs`: POSIX filesystem, can read `~/.agents/` directly. `kv`: opaque key-value persistence (IndexedDB/localStorage-style) — receives file contents inline, never paths. `none`: no persistence; everything inline, nothing cached. |
| `secrets` | `host` / `prompt` / `none` | `host`: client can resolve secret references itself (env vars, OS keychain). `prompt`: client will surface secret requests to the user interactively. `none`: ops needing secrets fail `-32003`. |
| `exec` | `boolean` | Client may execute/honor executable content (script hooks, command runners). `false` → script-type hook handlers are skipped with `skippedReason: "policy"`. |
| `skills` | `read-write` / `read` / `none` | `read-write`: scans and may write `~/.agents/skills/`. `read`: scans it; materialization still allowed (server writes, client reads). `none`: can't see the dir → `skills.materialize` requires `target: "inline"`. |
| `mcp` | `managed` / `external` / `none` | `managed`: client wants the bridge to run `tools.call` against bridge-managed MCP servers. `external`: client has its own MCP client stack; `tools.call` returns `-32003` (client bypasses). `none`: no MCP at all. |

Extension slots: a client MAY declare additional namespaced slots under
`slots` (e.g. `"dev.maki/canvas": true`). Unknown slot keys are ignored by
the server and excluded from the grant.

## 3. Hook events

`hookEvents` names the canonical lifecycle events the client's agent loop
will emit. Canonical set for v0.1 (harnesses declare the subset they
actually reach):

| Event | Fires | Input payload carries |
| --- | --- | --- |
| `session.start` | Agent session begins | `{ cwd?, agent?, sessionId? }` |
| `prompt.submit` | User prompt accepted, before model call | `{ prompt: string }` |
| `tool.pre` | Before a tool executes | `{ tool: string, arguments: object }` |
| `tool.post` | After a tool returns | `{ tool, arguments, result }` |
| `response.stop` | Model loop yields/stops | `{ reason: string }` |
| `session.end` | Session teardown | `{ reason: string }` |

Event names are open-typed (`string`) — harness-specific events are legal
but SHOULD be namespaced (`"dev.maki/pane.open"`). Undeclared events the
server never sees; `hooks.invoke` on an event outside the granted
`hookEvents` → `-32003`.

## 4. Graceful degradation rules

Degradation is *filtering at the boundary*, not failure in the loop:

1. **Kinds**: `extensions.list` filters out extensions whose primary `kind`
   (or every `provides` entry) is outside the granted `kinds`, unless
   `includeUnsupported: true` — in which case they appear with
   `supported: false`. Ops on an unsupported-kind extension → `-32003`.
2. **Events**: the client never invokes undeclared events; the server
   answers `-32003` if it does anyway.
3. **Storage**: `none`/`kv` → every file-bearing result is inline
   (`files[].content`), `materializedTo` is absent, `target: "store"`
   fails `-32003`.
4. **Skills**: `none` → `skills.materialize` with `target: "store"` →
   `-32003` (`data.capability: "skills"`); `target: "inline"` still works.
5. **Exec**: `false` → script hooks are reported per-handler as
   `status: "skipped", skippedReason: "policy"` in `hooks.invoke` results
   — the merged verdict proceeds without them. Script policy is the trust
   layer's (`spec/trust.md`), surfaced through this slot.
6. **MCP**: `external`/`none` → `tools.call` → `-32003`.
7. **Secrets**: `none` → any op that would need a secret fails `-32003`
   upfront, not mid-operation.

A browser-like host is simply a client that declares fewer slots:

```jsonc
// browser metaharness
{ "kinds": ["skill", "rule", "command"],
  "hookEvents": ["prompt.submit", "response.stop"],
  "slots": { "storage": "kv", "secrets": "prompt", "exec": false,
             "skills": "none", "mcp": "none" } }

// native CLI harness
{ "kinds": ["skill","mcp","plugin","hook","command","agent","rule"],
  "hookEvents": ["session.start","prompt.submit","tool.pre","tool.post","response.stop","session.end"],
  "slots": { "storage": "fs", "secrets": "host", "exec": true,
             "skills": "read-write", "mcp": "managed" } }
```

## 5. Authorization scoping (cross-reference)

Feature grants come from this document's model; **per-caller op
authorization** (which authenticated callers may invoke which methods —
e.g. a sandboxed harness granted `extensions.list`/`extensions.get` but
denied `hooks.invoke`) is configured on the *server* per caller identity,
not negotiated. See `transports.md` §3 for the identity model and
`security.md` §3 for the scope format. Failures surface as `-32012
forbidden`, never `-32003` — an op can be simultaneously in the negotiated
feature set and denied for this caller.
