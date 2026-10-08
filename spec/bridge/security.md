# AnyHarness Bridge Protocol v0.1 — security model

> What adopting the bridge does and doesn't change about a harness's trust
> posture. Integrity/script-policy/audit mechanics are owned by
> `spec/trust.md` and `spec/lockfile.md` — referenced by name, not
> redefined. Identity plumbing: `transports.md` §3.

## 1. Trust boundaries

```
┌─────────────┐   bridge protocol    ┌──────────────────┐   spec/trust.md    ┌─────────────┐
│   harness   │ ───────────────────▶ │  harness serve / │ ────────────────▶ │   store:    │
│  (client)   │ ◀─────────────────── │  @any-harness/sdk│                   │ ~/.agents/… │
└─────────────┘                      └──────────────────┘                   └─────────────┘
   trust this?                            trusts the trust layer                signed/locked
```

- **Adopting the bridge = adopting the trust layer.** A harness that speaks
  this protocol delegates install-time integrity, script policy, and audit
  to the server (`harness` binary or linked SDK). The wire contract carries
  *verdicts* (`hooks.invoke` results, materialized files), and the client
  trusts them because it chose this binary — same trust decision as running
  `harness add`.
- **The client still owns execution.** The server returns *data*: expanded
  prompts, skill files, hook verdicts. Clients MUST treat all payloads as
  data — never `eval` a `commands.resolve` expansion, never execute a
  `skills.materialize` file that didn't come through the trust-checked
  store path, never render `hook.delta` chunks as HTML unsanitized.
- **Per-caller boundary.** In daemon mode the server is shared: caller
  identity + per-caller op scoping (`transports.md` §3) is what keeps a
  sandboxed harness from driving `hooks.invoke`/`tools.call` on someone
  else's session.

## 2. Transport threat boundaries

The three transports have three different threat models — the protocol
doesn't pretend they're equivalent.

### stdio / in-process

- **Boundary = process ownership.** Whoever can spawn/link the server can
  already run arbitrary code as the user; the channel adds nothing. No
  token, no TLS, nothing to leak.
- Unix-socket variants MAY use peer credentials (`SO_PEERCRED` /
  `getpeereid`) for audit attribution; the peer is always the implicit
  `"owner"` caller, full scope.
- Residual risk: a hostile *plugin* can't touch the channel — handlers are
  files invoked by the server, not processes holding the socket.

### HTTP loopback — daemon mode

- **Boundary = same-uid file permissions.** `serve.json` is `0600` owned by
  the serving user; the bearer token is readable only by processes running
  as that user. Any process that can read it could have ptrace'd the daemon
  anyway — token auth matches the existing isolation level.
- Per-caller tokens let *policy* differ per harness even though *UID-level*
  isolation doesn't: a guest/sandboxed harness gets a scoped-down token
  (`allow: [extensions.list, extensions.get]`), and `-32012`/`forbidden`
  enforces it server-side.

### HTTP loopback — browser contexts

The dangerous case: a web page reaching loopback. Rules the server MUST
enforce:

- **Bearer token on every non-`/health` request.** The `Authorization`
  header makes every request a non-simple CORS request → preflight → the
  server sends **no** `Access-Control-Allow-Origin` by default, so foreign-
  origin pages can't read responses even if they somehow learned the token.
  `--cors <origin>` is an explicit opt-in for the metaharness origin.
- **Host-header allowlist:** accept only `Host: 127.0.0.1:*` /
  `localhost:*` / `[::1]:*`. Rejecting everything else kills
  DNS-rebinding attacks.
- **Token hand-off is explicit:** browsers can't read `serve.json` — the
  token arrives via `--print-token`, user paste, or an enrollment URL the
  user clicks. The server MUST NOT serve the token over HTTP.
- **`serve.json` is never a web asset:** the HTTP server MUST NOT serve
  files from `~/.agents/` or anywhere else; only the three defined
  endpoints exist.
- **Token rotation** (`--rotate-token`) revokes a possibly-leaked token
  without restarting the store.
- **TLS off, deliberately:** loopback traffic never crosses a network
  boundary; an on-host attacker who can sniff loopback already owns the
  box. TLS would add cert-distribution pain for zero threat reduction.

## 3. Authorization scoping format

Configured on the server (`anyharness.toml`, `[[serve.caller]]` entries —
see `transports.md` §3.1), enforced per request before dispatch:

- `allow` / `deny` are sets of bridge method names; `deny` wins; absent
  `allow` = full set. `capabilities.negotiate` and
  `events.notify`/`request.cancelled` are always permitted.
- Denied → `-32012` `forbidden`, `data.op` = the method. Distinct from
  `-32003` `capability-unsupported` (negotiated features) and `-32009`
  `auth-failed` (unknown caller).
- Recommended scope for untrusted/sandboxed callers: read-only
  (`extensions.list`, `extensions.get`, `commands.resolve`) — no
  `hooks.invoke` (drives per-event handler execution), no `tools.call`
  (spends MCP credentials), no `skills.materialize` (writes to the store).

## 4. Script policy through capabilities

Hooks/commands whose handlers are *scripts* are governed by the trust
layer's script policy (`spec/trust.md`). The bridge surfaces that policy
through the capability grant, so the harness sees enforcement without
re-implementing it:

- `slots.exec: false` → script handlers never run; they appear in
  `hooks.invoke` `results` as `status: "skipped", skippedReason: "policy"`.
- Policy refusing a specific handler or extension → `-32007`
  `policy-denied` (`data.policy` names the rule).
- Store content failing integrity → `-32008` `trust-violation`
  (`data.expected`/`data.actual` integrity values).
- Every enforcement decision lands in the audit log (`spec/trust.md`) with
  caller name, op, and extension id — daemon mode attribution is exactly
  the §3 caller identity.

## 5. Non-goals (stated honestly)

- The bridge does not sandbox extension code — script hooks run with the
  server's privileges. Isolation is policy + provenance, not containment.
- It does not authenticate *users*, only callers — multi-user auth is a
  registry-service concern (M4+), not loopback.
- It does not protect the store from a process running as the same uid;
  nothing at this layer can.
