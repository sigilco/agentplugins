# AnyHarness specs (L0)

Specification documents and machine-readable schemas for the AnyHarness
convergence layer. Everything here is a **delta on existing conventions** —
we codify what exists or ship explicitly-namespaced extensions; we never
assert a new universal `~/.agents/` layout.

## Documents

| Doc | Covers |
| --- | ------ |
| `store-layout.md` | `~/.agents/` coexistence rules: `harness/` is our ONLY root key (`packages/`, `data/`, `extensions.lock`, `config.toml`, `audit.log`, `store.json` inside); `skills/` adopted; `plugins/` never touched (Codex catalog + rival claimants); `mcp.json` merge-only; `skills-lock` files read-only; write mutex + skills.sh reconciliation |
| `manifest.md` | Agent Plugins 1.0 `plugin.json` base + `dev.anyharness/` vendor namespace (manifest data + extension directory: `hooks.json`, `commands/`, `agents/`, `rules/`, `setup`), Capabilities requests, 4-layer versioning policy |
| `lockfile.md` | `harness/extensions.lock`: per-Extension `{kind, manifest: ManifestRef, source{type,uri,ref}, integrity sha256, installedAt, targets[]}`; skills.sh interop mapping |
| `trust.md` | Threat model (agent-executed installs, executable components, provenance, explicit descope), integrity verification at install + load, script/exec policy in `config.toml`, `audit.log` JSONL format |
| `bridge/` | Bridge protocol v0.1: operations, capability model, three transports (stdio / HTTP loopback / in-process), `protocolVersion` handshake |

## Schemas

JSON Schemas live next to each doc (`.schema.json` suffix): `store-layout.schema.json` (the `harness/store.json` descriptor), `manifest.schema.json` (Agent Plugins base + `dev.anyharness` namespace), `lockfile.schema.json` (`extensions.lock`), `trust.schema.json` (one audit JSONL record).

Pinned interface names shared across specs: `Extension`, `ExtensionKind` (`skill | mcp | plugin | hook | command | agent | rule`), `ManifestRef`, `Capabilities` — defined in `store-layout.md` §2 and mirrored in the schema `$defs`.

## Normative references we build on

- Agent Skills spec (`SKILL.md`) — skills format, already converged
- Agent Plugins 1.0 (`plugin.json`) — package manifest base
- MCP — tool surface; `tools.call` in the bridge is a passthrough
- A2A — agent↔agent (adjacent, not ours)

## Governance & versioning

These specs are **implementation-led**: they stabilize from real adopters,
not committee review. Documents carry a semver version; breaking changes
bump the spec's major, additive optional fields bump minor.

Adoption pledge: the protocol and schemas are open — once **two or more
external harnesses** implement the bridge, stewardship moves toward a
neutral home (e.g. a foundation track such as AAIF) rather than staying
single-vendor. Until then, spec issues and change proposals go through this
repo's tracker.

Schema `$id`s are minted under
`https://raw.githubusercontent.com/sigilco/agentplugins/v2/spec/` as an
interim domain — resolvable and surviving GitHub's repo-transfer redirects;
a canonical domain replaces it once the org's domain is set.
