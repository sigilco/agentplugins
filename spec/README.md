# AnyHarness specs (L0)

Specification documents and machine-readable schemas for the AnyHarness
convergence layer. Everything here is a **delta on existing conventions** —
we codify what exists or ship explicitly-namespaced extensions; we never
assert a new universal `~/.agents/` layout.

## Documents (drafts — under construction)

| Doc | Covers |
| --- | ------ |
| `store-layout.md` | `~/.agents/` coexistence rules: `skills/` (adopted), `harness/` (ours), `plugins/` (never touch — Codex's catalog lives there), `mcp.json`, `extensions.lock`, `anyharness.toml` |
| `manifest.md` | Agent Plugins 1.0 `plugin.json` base + `dev.anyharness/` vendor namespace for hooks/commands/agents/rules |
| `lockfile.md` | `extensions.lock`: versions, sources, integrity hashes |
| `trust.md` | Integrity verification, script policy, audit log |
| `bridge/` | Bridge protocol v0.1: operations, capability model, three transports (stdio / HTTP loopback / in-process), `protocolVersion` handshake |

## Schemas

JSON Schemas live next to each doc (`.schema.json` suffix).

## Normative references we build on

- Agent Skills spec (`SKILL.md`) — skills format, already converged
- Agent Plugins 1.0 (`plugin.json`) — package manifest base
- MCP — tool surface; `tools.call` in the bridge is a passthrough
- A2A — agent↔agent (adjacent, not ours)
