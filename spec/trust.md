# AnyHarness trust model (L0)

**Spec version: 0.1.0-draft**

This document defines what AnyHarness does and does not guarantee about the
code it installs: integrity verification at install and load time, the policy
governing extension-provided executables, and the audit log that records
every trust-relevant event.

The machine-readable companion (`trust.schema.json`) describes one audit log
record.

## 1. Conformance language

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, RECOMMENDED, MAY, and
OPTIONAL are to be interpreted as described in RFC 2119 and RFC 8174 when, and
only when, they appear in all capitals.

## 2. Threat model

### 2.1 Assets and adversaries

Assets at stake when `harness` runs inside an agent environment:

- the user's filesystem reachable from the store root and from spawned
  processes (`~/.agents/`, project files, SSH keys, cloud credentials);
- host environment variables, frequently carrying secrets;
- agent behavior itself — an agent that can be told to run commands can be
  told to install packages;
- downstream harnesses that consume `~/.agents/` (every reader inherits our
  decisions).

Adversary classes:

- **Malicious package author** — ships hooks/MCP/commands that exfiltrate or
  persist. Classic supply chain, now with an automated installer in the loop.
- **Prompt injection → install** — novel vector specific to agent harnesses:
  content the *agent* reads (a webpage, an issue, a repo README) instructs it
  to run `harness add evil/pkg`. The "user" approving the install may be the
  compromised agent itself.
- **Repo takeover / tag move** — a once-good source turns hostile between
  installs or updates.
- **Typosquat / lookalike source** — `acme/deploy-tools` vs `acrne/deploy-tools`.
- **Tampered local state** — writes to `packages/` or `extensions.lock`
  outside our atomic-write protocol.

### 2.2 What this spec addresses

| Threat | Mechanism | Where |
| ------ | --------- | ----- |
| Tampering in transit / post-install mutation | Content integrity digest verified at install *and* load | §3 |
| Floating-source bait-and-switch | Floating refs MUST resolve to commit SHAs in the lockfile; updates re-resolve explicitly | §3.3 |
| Agent-executed installs | Actor-aware policy: non-interactive installs default to `ask`→`deny`, allowlists, review gates | §4.2 |
| Extension executables | Script policy: what may run, when, under whose confirmation | §4 |
| Silent policy/security state changes | Append-only audit log of every trust event | §6 |
| Lookalike/unvetted sources | Source allowlists + provenance record (uri + pinned ref + integrity) | §4.2, §5 |

### 2.3 Explicitly out of scope (stated, not implied)

v0 of this spec **descopes** to *installer + lockfile + integrity + audit*:

- **No sandbox.** AnyHarness does not sandbox extension executables. Hook,
  MCP, setup, and command processes run with the host's ambient privileges.
  Containment rules (Agent Plugins §4.1) govern *which package paths may be
  referenced*, not what spawned processes may touch. Sandboxing is a host
  concern (and a roadmap item, not an L0 guarantee).
- **No mandatory signing.** Provenance in v0 is the
  `(source.uri, source.ref→SHA, integrity)` triple — git-pin plus local
  content digest. Sigstore-style attestations are reserved in the lockfile
  (`attestations`) and MAY be added in a spec minor release; no extension is
  required to carry one, and no registry is a root of trust.
- **No central registry.** There is no AnyHarness registry vouching for
  packages. `registry`-type sources are treated exactly like `git` ones —
  verified by pin + digest, never by the registry's say-so.
- **No runtime monitoring.** The audit log records what *we* did; it is not
  a behavioral monitor of running extensions.

An implementation that wants stronger guarantees MUST layer them on top
(e.g. running extension processes under a host sandbox); they are not
portable contract.

## 3. Integrity verification

### 3.1 At install time

1. After staging a package in `harness/tmp/`, the installer computes the
   SRI-syntax digest defined by `lockfile.md` §4 over the staged tree.
2. Re-installs and updates MUST compare the fresh digest against the recorded
   `integrity`. A changed digest on an update path is normal (new version);
   the event is logged, not blocked. A changed digest on a *non*-update read
   path is a finding (§3.2).
3. For `git`/`github` sources the installer MUST verify the checked-out
   commit equals `source.ref`'s recorded SHA before digesting.

### 3.2 At load time

Before a host materializes or executes an extension's components, it verifies
the installed tree:

1. MUST verify the digest of every file the load will consume: `plugin.json`,
   `mcp.json`, all of `dev.anyharness/`, and each `skills/<dir>/` entry it
   will expose. Implementations MAY verify the full package digest for
   simplicity.
2. Implementations MAY cache a verification result keyed on (package path,
   digest input set, file mtimes/sizes). A cache MUST be invalidated by any
   change under the package root detectable via mtime/size — content digests
   are the fallback when metadata is unreliable.
3. On digest mismatch: the extension is **untrusted** — the host MUST NOT
   execute, materialize, or register its components, MUST write an
   `integrity.fail` audit event, and SHOULD surface a `doctor` finding. The
   remediation is reinstall (`harness add --reinstall`), never silent
   acceptance.

### 3.3 Update semantics

An update is a re-resolve + reinstall: fetch `source.uri`, resolve the ref,
verify the commit/digest, atomically swap `packages/<name>/`, rewrite the
lock entry (`updatedAt`, new `integrity`, new `ref`). `data/<name>/`
persists across updates (store-layout.md §4).

## 4. Script and executable policy

Extension packages are not inert: `dev.anyharness/setup` runs at install,
hooks run at lifecycle events, MCP servers run as subprocesses, skill
`scripts/` run on agent invocation. This section fixes who may run what,
when — the policy is configuration (`harness/config.toml`), not per-package
negotiation that a package could lobby for.

### 4.1 Policy surface

`config.toml` carries a `[policy]` table; defaults below are the spec's
required shipped defaults (implementations MUST NOT ship laxer defaults):

| Key | Values | Default | Governs |
| --- | ------ | ------- | ------- |
| `exec.setup` | `deny` \| `ask` \| `allow` | `ask` | `dev.anyharness/setup` at install |
| `exec.hooks` | `deny` \| `ask` \| `allow` | `ask` | hook entries declared in `hooks.json` |
| `exec.mcp` | `deny` \| `ask` \| `allow` | `ask` | stdio MCP server processes |
| `exec.skillScripts` | `deny` \| `ask` \| `allow` | `ask` | files under a skill's `scripts/` |
| `exec.nonInteractive` | `deny` \| `allow` | `deny` | what `ask` resolves to when no human can answer (agent/CI/daemon context) |
| `sources.allow` | string[] | `[]` | URI glob allowlist; empty = no restriction beyond other rules |
| `sources.deny` | string[] | `[]` | URI glob denylist, checked first |

`ask` means: prompt the human on the controlling TTY before first run of
each executable, then cache the decision per (extension, executable class)
for the lock entry's lifetime. When no TTY exists or the invoker is an
agent/non-interactive process, `ask` resolves to `exec.nonInteractive`'s
value — `deny` by default.

### 4.2 Agent-executed installs

`harness add` may be invoked by an agent as easily as by a human. The
countermeasure is actor-awareness, not hoping agents are well-behaved:

1. Every mutating operation records an `actor` in the audit event:
   `user` (interactive TTY), `agent` (detected agent/non-interactive
   context), or `daemon` (bridge server).
2. For `actor: agent`, install-time executable classes (`exec.setup`,
   `exec.hooks`) resolve `ask` → `deny` unless the source matches
   `sources.allow`. The package still installs; its executables stay
   dormant pending human review — which is the correct default under prompt
   injection, because the "approver" cannot be trusted.
3. `sources.allow` SHOULD be the recommended way to grant agents install
   autonomy: allowlisted provenance (exact `owner/repo` or registry
   coordinates, never broad globs) beats trusting the agent's judgment.
4. Policy changes are themselves audited (`policy.change` events) — an agent
   editing `config.toml` leaves a record.
5. Implementations SHOULD additionally gate installs behind the host
   harness's own tool-permission surface when embedded (the bridge declares
   install as a mutating operation in `capabilities.negotiate`).

### 4.3 Command discipline

Every executable AnyHarness materializes follows Agent Plugins §7.2.1
command semantics: one executable token (bare name or `./`-prefixed
package-relative path), `args` passed separately, `${PLUGIN_ROOT}` /
`${PLUGIN_DATA}` expansion only where defined, never shell strings. No
spec-defined field evaluates code.

## 5. Provenance and signing

The v0 provenance record is the lockfile triple per extension:
`source.uri` (canonical origin), `source.ref` (pinned commit SHA or
version), `integrity` (local content digest). Together they answer "what
did we install, from where, and is it still what we installed."

Reserved-not-required: `attestations[]` on a lock entry MAY later carry
sigstore-style bundle references (Fulcio-issued identity, Rekor log index)
per <https://www.sigstore.dev>. Verifying them is OPTIONAL; a v0 consumer
MUST ignore the field's contents (it MUST NOT fail the entry). This spec
makes no claim that registry or git hosts attest anything — provenance is
self-recorded.

## 6. Audit log

### 6.1 Location and form

`~/.agents/harness/audit.log` — append-only JSON Lines: one JSON object per
line, UTF-8, appended under the same `harness/.lock` mutex as other
mutations (store-layout.md §7.2). `O_APPEND` semantics; partial lines from
crashed writers are tolerated by readers (skip and continue).

### 6.2 Event record

Each line validates against `trust.schema.json`:

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `ts` | string | yes | RFC 3339 / ISO 8601 UTC timestamp. |
| `event` | string | yes | Event type (enum below). |
| `actor` | string | yes | `user` \| `agent` \| `daemon`. |
| `extension` | ManifestRef | no | The affected extension, when applicable. |
| `decision` | string | no | Policy decision taken: `allow` \| `deny` \| `ask`. |
| `integrity` | string | no | SRI digest relevant to the event (installed/verified value). |
| `source` | object | no | The lockfile Source object for install/update events. |
| `details` | object | no | Free-form event payload (non-secret; MUST NOT contain env values, tokens, or file contents). |

`event` values: `install`, `update`, `remove`, `integrity.verify`,
`integrity.fail`, `exec.allow`, `exec.deny`, `policy.change`,
`lockfile.corrupt`, `skills.conflict`.

### 6.3 Rules

1. Every trust decision (install, update, exec allow/deny, integrity
   failure, policy change) MUST produce an audit event. Audit MUST NOT be
   disabled by configuration.
2. Writers MUST NOT rewrite or truncate history; rotation, if any, is by
   archiving whole files (`audit.log.1`, …), never in-place edits.
3. Audit records are user-visible data: implementations MUST NOT write
   secrets, credential values, or env contents into `details`.
4. The audit log is evidence, not enforcement: a missing log does not block
   operation, but a missing-or-unwritable log on a mutating operation SHOULD
   produce a `doctor` finding.

## 7. Versioning

The audit record schema is versioned by the spec, not inline: additive
fields are a spec minor change (consumers MUST ignore unknown fields);
renaming/removing fields or changing `event` semantics is a spec major
change. Policy keys in `config.toml` follow the same rule.

## 8. Normative references

- `store-layout.md` — paths, `.lock` mutex, ManifestRef.
- `lockfile.md` — integrity digest construction, lock entry fields.
- `manifest.md` — `dev.anyharness` component formats, Capabilities.
- Agent Plugins 1.0 — containment (§4.1), command/env semantics
  (§7.2.1, §9). <https://agent-plugins.org>
- W3C Subresource Integrity — digest syntax. <https://www.w3.org/TR/SRI/>
- Sigstore — attestation model referenced by §5.
  <https://www.sigstore.dev>
