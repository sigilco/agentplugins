---
title: Capability Matrix
description: What each supported harness supports — universal codegen, guided per-harness, or unsupported. Includes the native escape hatch for every gap so you can ship on the native path today.
---

# Capability Matrix

**Supported harnesses:** Claude Code · Codex · OpenCode · Pi Mono

**Additional (tracked, not blocking):** Copilot · Gemini · Kimi

Legend:

- ✅ **Universal codegen** — adapter emits native output automatically from the manifest.
- ⚠️ **Guided per-harness** — no native primitive of its own; a documented escape-hatch pattern covers the gap. Emits a WARN (not error) on portable manifests.
- ❌ **Unsupported** — no viable path on this harness; recorded here, not blocking.
- n/a — not applicable (mechanism differs but functionality is covered).

> **Reading the "Escape hatch" column:** for every ⚠️ cell there's a deliberate reason we don't emit a universal primitive for that capability on that harness yet — the work to express it universally is significant, and a native path already does the job. If you're shipping today, use the escape hatch. If you want a universal primitive, see the **Decision tree for authors** at the bottom.

## Capability table

| Capability               | Claude Code | Codex       | OpenCode | Pi Mono | Escape hatch                                                                                                              | Notes                                                                                                                      |
| ------------------------ | :----------: | :----------: | :------: | :-----: | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `skills`                 | ✅           | ✅           | ✅       | ✅      | —                                                                                                                         | Universal codegen                                                                                                          |
| `hooks` (lifecycle)      | ✅           | ✅           | ✅       | ✅      | —                                                                                                                         | Universal codegen                                                                                                          |
| `commands`               | ✅           | ✅           | ✅       | ✅      | —                                                                                                                         | Universal codegen                                                                                                          |
| `mcpServers`             | ✅           | ✅           | ✅       | ⚠️     | Pi has no built-in MCP. Ship tools via native `tools[]` (emitted natively), or bridge an MCP server through a Pi extension via `nativeEntry.pimono`. | Universal on Claude · Codex · OpenCode. Pi Mono has no MCP; emits WARN when `mcpServers` is set. See [MCP on Pi](/guide/porting#mcp-on-pi). |
| `agents[]`               | ✅           | ✅           | ✅       | ⚠️     | Pi has no named-agent declaration primitive. Use `nativeEntry.pimono` to spawn custom agents via a Pi extension.           | Pi adapter emits nothing for `agents[]`; use `nativeEntry.pimono` for custom agent wiring on Pi.                           |
| `agents[].model`         | ✅           | ⚠️          | ✅       | ⚠️     | Codex/Pi: use the harness's own per-agent model config (or simply omit and accept the harness default).                    | Claude + OpenCode emit `model:` frontmatter when set. Codex/Pi have no per-agent file concept; model unset → harness default. |
| `subagentStart`          | ✅           | ✅           | ⚠️      | ✅      | OpenCode: intercept `subagent` tool calls with `preToolUse` matcher (subagents launch via the `subagent` tool).            | Emits WARN on OpenCode. Pi maps to `agent.AgentStart` lifecycle event.                                                      |
| `subagentStop`           | ✅           | ✅           | ⚠️      | ✅      | OpenCode: detect via `postToolUse` / `postToolUseFailure` on the `subagent` tool.                                          | Emits WARN on OpenCode. Pi maps to `agent.AgentStop` lifecycle event. Pi `stop`↔`subagentStop` collision fixed in v0.3.0.   |
| `tools[]` (first-class)  | ⚠️          | ⚠️          | ✅       | ✅      | Claude/Codex: ship tools via `mcpServers` — works on all four harnesses (universal).                                       | WARN emitted; OpenCode/Pi emit first-class `tools[]` natively.                                                             |
| `stop` / `continueWith`  | ⚠️          | ⚠️          | ⚠️      | ⚠️     | Each harness already has a `stop`-class lifecycle hook natively — emit nothing in portable manifests until v0.5.0.  | New universal primitive — v0.5.0; all-harness design.                                                                       |
| Native-entry passthrough | n/a (JSON)  | n/a (JSON)   | ⚠️      | ⚠️     | OpenCode: drop a `.ts` file directly into `~/.config/opencode/plugins/<name>/` — Bun runs it as ESM, no codegen needed.   | `nativeEntry` escape hatch — ships in v0.5.0; OpenCode native modules must be `.ts` (file-drop path).                       |
| Inline hook handlers     | ✅ auto-wrap | ✅ auto-wrap | ✅       | ✅      | —                                                                                                                         | Codex/Kimi: auto-wrapped as Node.js command scripts (v0.5.0).                                                              |

## Additional harnesses

| Capability                       | Copilot | Gemini | Kimi | Escape hatch                                                                                | Notes                                                              |
| -------------------------------- | :-----: | :----: | :--: | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `skills`                         | ✅      | ✅     | ✅   | —                                                                                           | Universal.                                                          |
| `hooks` (lifecycle)              | ⚠️     | ⚠️    | ❌   | Copilot/Gemini: use HTTP or `command` handlers (see [Hooks](/guide/hooks)).                 | Kimi supports a subset (see below).                                  |
| `subagentStart` / `subagentStop` | ❌      | ❌    | ❌   | TUI fidelity only — implement per-harness via native plugin config if you really need it.    | No universal primitive planned.                                    |
| `tools[]`                        | ✅      | ✅     | ❌   | —                                                                                           | First-class tool emission.                                          |
| `mcpServers`                     | ❌      | ❌    | ❌   | Wire the MCP server directly into the harness's native config — no agentplugins path needed. | Not on the manifest path; harness-level wiring only.                |

Kimi supported hooks: `preToolUse`, `userPromptSubmit`, `sessionStart`, `notification`, `permissionRequest`. Inline handlers auto-wrapped as Node.js command scripts (v0.5.0).

## Decision tree for authors

```
Does universal codegen cover this capability across all four core harnesses?
  YES → use it; adapter handles the rest
  NO  → does the native escape hatch (Escape hatch column above) cover it today?
    YES → ship the escape hatch now; document the limitation in the manifest
    NO  → can you express it per-harness via nativeEntry + a hand-written module?
      YES → use nativeEntry; emit WARN (not error)
      NO  → is the gap TUI-grade fidelity only?
        YES → acceptable degradation; note in this matrix
        NO  → open a primitive proposal (v0.5.0+ scope)
```

---

*This matrix is the living contract for the project. Update it as capabilities land or gaps are discovered.*
