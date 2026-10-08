# AnyHarness store layout (L0)

**Spec version: 0.1.0-draft**

This document defines how AnyHarness coexists inside `~/.agents/`: which paths
it owns, which paths it shares, and which paths it must never touch. It is a
delta on existing conventions — it codifies what already exists and reserves
exactly one root key, `harness/`. It does not assert a universal `~/.agents/`
layout.

The machine-readable companion for the store descriptor is
`store-layout.schema.json`.

## 1. Conformance language

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, RECOMMENDED, MAY, and
OPTIONAL are to be interpreted as described in RFC 2119 and RFC 8174 when, and
only when, they appear in all capitals.

## 2. Terminology

| Term | Meaning |
| ---- | ------- |
| **Extension** | The installed unit of the store. One Extension occupies exactly one directory under `~/.agents/harness/packages/<name>/`, or — for `kind: "skill"` materialized into the shared root — one directory under `~/.agents/skills/<name>/`. An Extension's contents are described by its manifest (see `manifest.md`) and its installed state by `extensions.lock` (see `lockfile.md`). |
| **ExtensionKind** | The kind of an Extension or of a component inside it. Exactly one of: `skill`, `mcp`, `plugin`, `hook`, `command`, `agent`, `rule`. This enumeration is closed; new kinds require a spec minor release. |
| **ManifestRef** | A pointer to a manifest document plus the version resolved at install time: `{ name, version }`, where `name` equals the manifest's `name` field and `version` its `version` field. Used wherever the spec must reference "which package revision produced this." |
| **Capabilities** | The set of host-injected environment slots a component may request — e.g. `storage`, `secrets`, `exec`, `network`, `fs`. Hosts grant slots; absent slots are declared (via `capabilities.negotiate` on the bridge), never probed. Request syntax is defined in `manifest.md`; grant policy in `trust.md`. |
| **Store root** | The directory `~/.agents/` as resolved from the active user's home directory. |
| **Our store** | `~/.agents/harness/` — the only root-level key this spec claims. |

## 3. The `~/.agents/` shared namespace

`~/.agents/` is a shared namespace in the `/usr/local` sense: many tools drop
entries under self-owned subpaths, and no single tool owns the root. Verified
occupants as of this writing include the `skills/` directory (Codex, Cursor,
OpenCode, Gemini CLI, Copilot, Warp, Zed, pi, Kimi), Codex's
`plugins/marketplace.json` catalog, skills.sh's `.skill-lock.json`, and
rival claimants (agentstow "Commons", dotagents, agentsfolder/spec, others).

AnyHarness claims **exactly one** root-level key: `harness/`. An AnyHarness
implementation:

1. MUST NOT create files or directories at the `~/.agents/` root other than
   `harness/` and the shared writes permitted in §5.
2. MUST NOT read, write, move, or delete `~/.agents/plugins/` or anything
   under it (§5.3).
3. MUST ignore every other root-level entry it does not recognize, including
   files placed there by other tools or rival `.agents/` specs.
4. MUST NOT write to the `~/.agents/skills/` root itself — only to skill
   directories it manages (§5.1).
5. MAY honor an `ANYHARNESS_HOME` environment variable (or equivalent host
   configuration) relocating the store root for testing or non-home
   deployments. When set, all `~/.agents/` references below resolve against
   it. Hosts MUST NOT silently mix store roots.

## 4. `~/.agents/harness/` — our store

Everything AnyHarness owns lives under `harness/`:

```text
~/.agents/harness/
  store.json              # store descriptor (this spec's machine-readable file)
  packages/<name>/        # installed Extensions (plugin roots, verbatim)
  data/<name>/            # per-Extension writable data dirs (PLUGIN_DATA)
  extensions.lock         # lockfile — see lockfile.md
  config.toml             # local configuration, incl. trust policy — see trust.md
  audit.log               # append-only audit log (JSONL) — see trust.md
  tmp/                    # staging area for atomic installs/writes
  .lock                   # advisory write mutex — see §7
```

Rules:

1. `packages/<name>/` contains the Extension's package exactly as sourced:
   `plugin.json` at its root, component directories, vendor namespaces. `<name>`
   MUST equal the manifest `name` field after normalization (§6.2).
2. `data/<name>/` is the per-Extension persistent data directory — the value a
   host supplies as `PLUGIN_DATA` when launching an Extension's stdio MCP
   servers, per Agent Plugins 1.0 §9. It MUST be created before first use,
   MUST be writable by the Extension's subprocesses, and MUST survive updates.
   It MAY be deleted on uninstall.
3. `tmp/` holds partially-extracted packages and pending writes. A directory
   under `tmp/` MUST NOT be considered installed; installation completes by an
   atomic rename into `packages/`. Readers MUST ignore `tmp/`.
4. `harness/store.json` is the store descriptor defined in §8.
5. Other implementations MUST NOT write under `harness/`; AnyHarness MUST NOT
   interpret foreign files found there (except to report them via `doctor`).

## 5. Shared and foreign paths

### 5.1 `~/.agents/skills/` — adopted as-is

The `skills/` subtree is the established shared location for the Agent Skills
specification (<https://agentskills.io/specification>). AnyHarness treats it as
a read/write shared location with the following compatibility guarantees:

1. An AnyHarness install MAY place skill components under `skills/<name>/` when
   the install target is the shared skills root (materializing a `skill`-kind
   Extension). Each such directory MUST be a conformant Agent Skills skill —
   a directory containing `SKILL.md` — and MUST NOT contain files other than
   skill content. Some readers scan exactly one level of `skills/` and ignore
   stray files; polluting the root or nesting non-skill entries is unsafe.
2. AnyHarness MUST NOT modify or remove a skill directory it did not install.
   Ownership is decided by `extensions.lock` (ours) vs. `.skill-lock.json` /
   `skills-lock.json` (skills.sh) — see §7.3 for the reconciliation rules.
3. AnyHarness MUST tolerate foreign skills coexisting in `skills/` and MUST NOT
   require it to contain only AnyHarness-managed entries.
4. AnyHarness MUST NOT treat `plugins/`, `harness/`, or any non-skill root
   entry as a skill.

### 5.2 `~/.agents/mcp.json` — shared MCP declarations

`mcp.json` at the store root is a shared file in the de-facto
`{"mcpServers": {…}}` shape. AnyHarness:

1. MAY read `mcp.json` to satisfy `mcp`-kind component requests.
2. When writing, MUST merge: add or replace only the `mcpServers` member names
   it manages (recorded in `extensions.lock`), MUST preserve every other
   member name and every other top-level field byte-for-byte semantics.
3. MUST NOT create `mcp.json` with any top-level field other than
   `mcpServers`.
4. MUST NOT modify `mcp.json` when it is not a JSON object or lacks an object-
   valued `mcpServers` member — a foreign dialect means "leave it alone," and
   AnyHarness SHOULD report this via `doctor`.

### 5.3 `~/.agents/plugins/` — never touched

`plugins/` is claimed by OpenAI Codex for `marketplace.json` — a *catalog* of
plugin sources, not a store of installed plugins — and is additionally
asserted by rival `.agents/` proposals (agentstow, dotagents). Its semantics
are foreign, contested, and different from ours. AnyHarness:

1. MUST NOT read, write, create, or delete `~/.agents/plugins/` or any path
   under it.
2. MUST NOT interpret `plugins/marketplace.json` or assume `plugins/<name>/`
   directories are installed packages.
3. MUST NOT rely on `plugins/` being empty, absent, or conformant to any
   particular content.

### 5.4 `~/.agents/.skill-lock.json` and project `skills-lock.json`

Both belong to skills.sh (`npx skills`,
<https://github.com/vercel-labs/skills>): the former is the global install
lock, the latter a per-project manifest. AnyHarness MUST NOT write either
file. AnyHarness SHOULD read `.skill-lock.json` when reconciling `skills/`
ownership (§7.3) and MAY read a project `skills-lock.json` when importing
skill provenance.

### 5.5 `harness/config.toml` — namespaced configuration

`config.toml` is ours but sectioned by spec document so sibling specs own
their keys without interleaving:

| Key prefix | Owned by | Notes |
| ---------- | -------- | ----- |
| `[policy]` | `trust.md` §4.1 | Exec/script policy and source allowlists. |
| `[[serve.caller]]` | `spec/bridge/transports.md` §3 | Reserved. HTTP-loopback daemon caller table: caller identity + per-token `allow`/`deny` op lists. This document defines only the reservation; semantics live there. |
| everything else | unspecified | Future spec revisions allocate new top-level tables explicitly; implementations MUST ignore unknown tables. |

This document defines no other `config.toml` keys.

### 5.6 Everything else

Root entries not listed here — `AGENTS.md`, `commands/`, `agents/`,
`models.json`, `modes/`, `manifest.yaml`, other tools' dotfiles — belong to
other tools or other spec proposals. AnyHarness MUST ignore them and MUST NOT
create analogues at root.

## 6. Naming and path rules

### 6.1 Store paths

All paths under `harness/` are UTF-8, POSIX-separator logical paths.
Implementations on non-POSIX filesystems translate separators; the logical
form above is canonical.

### 6.2 Extension directory names

`packages/<name>/` and `data/<name>/` names MUST satisfy the Agent Plugins 1.0
§5.5 name constraints (1–64 chars, `a-z0-9.-`, alphanumeric ends, no `--` or
`..`). For `local`-source Extensions whose manifest name collides with an
installed one, the installer MUST reject rather than silently rename —
directory name equals manifest name, always.

### 6.3 Containment

Per Agent Plugins 1.0 §4.1: every package-relative path AnyHarness resolves
(`./`-prefixed manifest paths, `${PLUGIN_ROOT}` expansions, component
locations) MUST remain inside the filesystem-resolved package directory.
Symlinks resolving outside the package root MUST be rejected. The same rule
applies to `data/<name>/` paths escaping `data/`.

## 7. Concurrency and coexistence

### 7.1 Atomic writes

Every write AnyHarness makes to a file under `~/.agents/` (its own or shared)
MUST be atomic: write to a sibling temp path, `fsync` where the platform
allows, then rename. A reader MUST be prepared to see either the complete old
file or the complete new file, never a partial one. Installs MUST stage under
`harness/tmp/` and complete by rename.

### 7.2 Write mutex

Mutating operations (install, remove, update, lockfile write, config write,
`mcp.json` merge) MUST hold an advisory lock at `harness/.lock` for the
mutation's duration. The mechanism is platform-defined (lockfile with
`O_EXCL` creation, `flock`, or host-provided equivalent); the contract is
mutual exclusion among cooperating AnyHarness processes. Readers MAY read
lock-free but MUST tolerate the atomic-rename protocol in §7.1. When multiple
harnesses share one store through the bridge server (`harness serve`), the
serving process is the only writer; direct-CLI access while a daemon holds
the store MUST honor the same `.lock` file. A stale lock MAY be broken after
proving the holder process is dead; the mechanism is implementation-defined.

### 7.3 `skills/` reconciliation

`~/.agents/skills/` is multi-manager: skills.sh installs and symlinks skill
dirs and tracks them in `.skill-lock.json`; harnesses and users also drop
dirs directly. Reconciliation rules:

1. A skill directory is **AnyHarness-managed** iff `extensions.lock` contains
   an Extension that materialized it. Otherwise it is foreign.
2. AnyHarness MUST NOT overwrite, update, or delete a foreign skill
   directory — including one owned by skills.sh (present in
   `.skill-lock.json`) or an unmanaged user dir.
3. If an install would create `skills/<name>/` and a foreign `<name>/`
   already exists, the installer MUST fail with a name-conflict diagnostic —
   never merge into or shadow the foreign dir. The resolution is an explicit
   user action (remove the foreign dir, or install under a different name),
   never an automatic takeover.
4. When skills.sh and AnyHarness both legitimately manage *different* skill
   dirs, no coordination is needed — the directories are independent.
5. AnyHarness SHOULD treat `.skill-lock.json`'s `skills` map as evidence of
   skills.sh ownership when reporting `doctor` conflicts, and SHOULD surface
   rather than silently coexist with a skills.sh-managed dir of the same
   name.

## 8. `store.json` — the store descriptor

`harness/store.json` marks the layout version of the store and is the anchor
for future layout migrations. It is a single JSON object validated by
`store-layout.schema.json`:

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `$schema` | string | no | Canonical schema id for this document. |
| `layoutVersion` | integer | yes | Store layout version. This document defines `1`. |
| `createdAt` | string | yes | RFC 3339 / ISO 8601 UTC timestamp of store creation. |
| `createdBy` | string | no | Implementation identifier, e.g. `anyharness-cli 0.2.0`. |

Rules:

1. An implementation MUST write `store.json` on store creation and MUST NOT
   rewrite it on ordinary operations.
2. An implementation encountering `layoutVersion` greater than its supported
   version MUST refuse to write to the store (reads MAY proceed at its own
   risk) and SHOULD report the required layout version.
3. An implementation encountering a missing or invalid `store.json` in a
   non-empty `harness/` SHOULD run migration/`doctor` semantics before
   writing; in an empty `harness/` it creates the file with
   `layoutVersion: 1`.

## 9. Compatibility guarantees (summary)

| Path | We read | We write | Guarantee |
| ---- | ------- | -------- | --------- |
| `harness/` | yes | yes | Sole owner. Layout versioned by `store.json`. |
| `skills/<name>/` | yes | ours only | Conformant skills only; never foreign dirs (§5.1, §7.3). |
| `mcp.json` | yes | merge only | `mcpServers` member-level merge; foreign keys preserved (§5.2). |
| `plugins/` | no | no | Never touched (§5.3). |
| `.skill-lock.json`, `skills-lock.json` | yes | no | Read-only provenance/conflict evidence (§5.4). |
| other root entries | ignore | no | None created; none interpreted (§3, §5.6). |

## 10. Normative references

- Agent Plugins 1.0 — package model, manifest base, `PLUGIN_DATA`,
  containment rules. <https://agent-plugins.org> /
  <https://github.com/agentplugins/agent-plugins-spec>
- Agent Skills specification — `SKILL.md` format for `skills/<name>/`.
  <https://agentskills.io/specification>
- skills.sh (`vercel-labs/skills`) — `.skill-lock.json` / `skills-lock.json`
  conventions. <https://github.com/vercel-labs/skills>
- Codex plugin docs — `plugins/marketplace.json` semantics.
  <https://developers.openai.com/codex/plugins/build/>
- `lockfile.md`, `manifest.md`, `trust.md` — sibling L0 docs.
