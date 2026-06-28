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
| `agents[].model` | ✅ | ⚠️ | ✅ | ⚠️ | Claude + OpenCode: emits `model:` frontmatter when set. Codex/Pi Mono: no per-agent file concept; model unset → harness default |
| `subagentStart` | ✅ | ✅ | ⚠️ | ✅ | OpenCode: no native event; emits WARN; guided path: intercept via `preToolUse` for subagent tool |
| `subagentStop` | ✅ | ✅ | ⚠️ | ✅ | Same as above; Pi `stop`↔`subagentStop` collision fixed in v0.3.0 |
| `tools[]` (first-class) | ⚠️ | ⚠️ | ✅ | ✅ | WARN emitted; use `mcpServers` for Claude/Codex (Tier-1 universal tool path) |
| `stop` / `continueWith` | ⚠️ | ⚠️ | ⚠️ | ⚠️ | New primitive — v0.4.0; all-Tier-1 design |
| Native-entry passthrough | n/a (JSON) | n/a (JSON) | ⚠️ | ⚠️ | `nativeEntry` escape hatch — v0.4.0; OpenCode native modules must be `.ts` (file-drop path, no config.json edits needed) |
| Inline hook handlers | ✅ auto-wrap | ✅ auto-wrap | ✅ | ✅ | Codex/Kimi: auto-wrapped as Node.js command scripts — v0.4.0 |

## Tier-2 footnotes

| Capability | Copilot | Gemini | Kimi |
|---|:---:|:---:|:---:|
| `skills` | ✅ | ✅ | ✅ |
| `hooks` (lifecycle) | ⚠️ | ⚠️ | ❌ |
| `subagentStart` / `subagentStop` | ❌ | ❌ | ❌ |
| `tools[]` | ✅ | ✅ | ❌ |
| `mcpServers` | ❌ | ❌ | ❌ |

Kimi supported hooks: `preToolUse`, `userPromptSubmit`, `sessionStart`, `notification`, `permissionRequest`. Inline handlers auto-wrapped as Node.js command scripts (v0.4.0).

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

*This matrix is the living contract for the project. Update it as capabilities land or gaps are discovered. See the [PRD roadmap](/guide/introduction) for full context.*
