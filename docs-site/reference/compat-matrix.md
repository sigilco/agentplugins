---
title: Tier-1 Capability Matrix
description: What each Tier-1 harness supports — universal codegen, guided per-harness, or unsupported.
---

# Tier-1 Capability Matrix

**Tier-1 harnesses:** Claude Code · Codex · OpenCode · Pi Mono

**Tier-2 harnesses (tracked, not blocking):** Copilot · Gemini · Kimi

Legend:
- ✅ **Universal codegen** — adapter emits native output automatically from the manifest
- ⚠️ **Guided per-harness** — no native primitive; author follows a documented escape-hatch pattern; emits a WARN (not error) on portable manifests
- ❌ **Unsupported** — no viable path; recorded here, not blocking
- n/a — not applicable (mechanism differs but functionality is covered)

## Capability table

| Capability | Claude Code | Codex | OpenCode | Pi Mono | Notes |
|---|:---:|:---:|:---:|:---:|---|
| `skills` | ✅ | ✅ | ✅ | ✅ | Universal codegen |
| `hooks` (lifecycle) | ✅ | ✅ | ✅ | ✅ | Universal codegen |
| `commands` | ✅ | ✅ | ✅ | ✅ | Universal codegen |
| `mcpServers` | ✅ | ✅ | ✅ | ✅ | **Recommended universal tool path** |
| `agents[]` | ✅ | ✅ | ✅ | ✅ | Universal codegen |
| `subagentStart` | ✅ | ✅ | ⚠️ | ✅ | OpenCode: no native event; guided per-harness snippet available |
| `subagentStop` | ✅ | ✅ | ⚠️ | ✅ | Same as above; Pi `stop` collision fixed (v0.3.0) |
| `tools[]` (first-class) | ❌ native | ❌ native | ✅ | ✅ | Use `mcpServers` for Claude/Codex; WARN emitted |
| `stop` / `continueWith` | ⚠️ | ⚠️ | ⚠️ | ⚠️ | New primitive — v0.4.0; all-Tier-1 design |
| Native-entry passthrough | n/a (JSON) | n/a (JSON) | ⚠️ | ⚠️ | `nativeEntry` escape hatch — v0.4.0 |
| `spawnChild` subprocess | ✅ via cmd | ✅ via cmd | ⚠️ | ⚠️ | Primitive set — v0.4.0 |

## Tier-2 footnotes

| Capability | Copilot | Gemini | Kimi |
|---|:---:|:---:|:---:|
| `skills` | ✅ | ✅ | ✅ |
| `hooks` (lifecycle) | ⚠️ | ⚠️ | ❌ |
| `subagentStart` / `subagentStop` | ❌ | ❌ | ❌ |
| `tools[]` | ✅ | ✅ | ❌ |
| `mcpServers` | ❌ | ❌ | ❌ |

Kimi `hooks` remain in `UNSUPPORTED_HOOKS` (`packages/adapter-kimi/src/index.ts`); tracked here, not blocking v0.3.0.

## Decision tree for authors

```
Does universal codegen cover this capability across all Tier-1?
  YES → use it; adapter handles the rest
  NO  → is there a custom (escape-hatch) path on all Tier-1?
    YES → follow the guided per-harness pattern (see "Rewriting for tier-1 parity" guide)
    NO  → is the gap TUI-grade fidelity only?
      YES → acceptable degradation; note in this matrix
      NO  → open a primitive proposal (v0.4.0+ scope)
```

---

*This matrix is the living contract for the project. Update it as capabilities land or gaps are discovered. See [`.agents/plans/2026-06-25-tier1-parity-roadmap.md`](../../.agents/plans/2026-06-25-tier1-parity-roadmap.md) for the full roadmap.*
