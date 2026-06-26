---
title: Rewriting for Tier-1 Parity
description: How to port an existing plugin to the AgentPlugins universal manifest with functional parity across all Tier-1 harnesses.
---

# Rewriting for Tier-1 Parity

This guide walks through porting an existing per-harness plugin to AgentPlugins so it delivers the **same functionality** across all four Tier-1 harnesses: Claude Code, Codex, OpenCode, and Pi Mono.

> **Rule:** A capability must work across all Tier-1 harnesses at the functionality level — not necessarily with identical TUI chrome, but the same underlying behaviour.

---

## The decision tree

For each capability in your existing plugin, work through this tree:

```
1. Does universal codegen cover it across all Tier-1?
   YES → declare it in the manifest; the adapter handles the rest
   NO  → continue ↓

2. Can all Tier-1 harnesses support it via a per-harness escape hatch?
   YES → implement guided per-harness (see below); emit WARN on build
   NO  → continue ↓

3. Is the gap TUI-grade fidelity only (overlays, widgets)?
   YES → acceptable degradation; note in compat matrix; ship it
   NO  → open a primitive proposal (v0.4.0+ scope; don't block the rewrite)
```

---

## Step 1 — Audit your existing plugin

List every capability your plugin provides:

| Capability | What it does | Hook / mechanism |
|---|---|---|
| Session banner | Prints a welcome message | `sessionStart` |
| Tool guard | Blocks dangerous commands | `preToolUse` |
| Custom command | `/reset` clears state | `commands[]` |
| Overlay UI | Side panel in Pi TUI | Pi-specific |

For each row, check the [Tier-1 Capability Matrix](/reference/compat-matrix) to see whether it's universal-codegen, guided-per-harness, or unsupported.

---

## Step 2 — Universal codegen (most capabilities)

Capabilities expressed through hooks, skills, commands, and mcpServers map directly to the manifest. This covers the majority of real-world plugins:

```typescript
import { definePlugin } from '@agentplugins/core'

export default definePlugin({
  name: 'my-plugin',
  version: '1.0.0',
  description: 'My cross-harness plugin',

  hooks: {
    sessionStart: {
      handler: { type: 'command', command: './hooks/session-start.sh' },
    },
    preToolUse: {
      handler: { type: 'command', command: './hooks/tool-guard.sh' },
    },
  },

  commands: [
    { name: 'reset', description: 'Reset plugin state', command: './scripts/reset.sh' },
  ],

  // Tools via MCP — works on all Tier-1
  mcpServers: {
    'my-tools': { command: 'npx', args: ['my-tools-mcp-server'] },
  },
})
```

Build and verify on each Tier-1:

```bash
agentplugins build
agentplugins validate
```

---

## Step 3 — Guided per-harness (escape hatch)

Some capabilities have no universal primitive but can be implemented per-harness. The build succeeds with a WARN; you implement the harness-specific path yourself.

**Example: subagentStart/Stop on OpenCode**

OpenCode has no native subagent lifecycle event. Instead, intercept the subagent tool call via `preToolUse`/`postToolUse` and filter on tool name:

```typescript
hooks: {
  preToolUse: {
    handler: {
      type: 'command',
      command: './hooks/tool-intercept.sh',
      // tool-intercept.sh checks $TOOL_NAME == "subagent" and acts accordingly
    },
  },
},
```

The WARN emitted on `agentplugins validate` for OpenCode points here. Record the gap in the [compat matrix](/reference/compat-matrix).

**Per-harness fallback pattern (v0.4.0+):**

Once `nativeEntry` lands (4.2), you can provide a hand-written TS file for code-emitting adapters:

```typescript
// agentplugins.config.ts (v0.4.0+)
nativeEntry: {
  pimono: './src/pimono-native.ts',
  opencode: './src/opencode-native.ts',
}
```

This file is copied verbatim into the dist and has full access to the harness's own SDK.

**OpenCode native module rule:**

OpenCode auto-discovers only `.ts` files dropped in `~/.config/opencode/plugins/`. Ship all native OpenCode modules as `.ts` (ESM syntax is valid TypeScript; Bun runs it natively without type-checking). Sibling files (hooks, helpers) resolve correctly because `agentplugins install` symlinks the module back into the plugin store — `import.meta.url` resolves to the store path, so relative `require`/`import` paths work without copies.

You do not need to edit `~/.config/opencode/config.json`. The `.ts` file-drop is sufficient.

If you ship a `.mjs` source, `agentplugins` automatically links it under a `.ts` name (safety net) but emits a WARN. Rename the source to `.ts` to silence it.

---

## Step 4 — TUI-only features (acceptable degradation)

Overlays, side panels, and interactive widgets that use Pi's TUI system (`@earendil-works/pi-tui`) are Pi-only by nature. This is the **one allowed degradation** category:

- Implement the TUI feature on Pi via `nativeEntry` (v0.4.0+)
- On other Tier-1: omit the widget; the underlying functionality (data, hooks, state) must still work
- Record in compat matrix as "TUI fidelity — Pi only"

---

## Step 5 — Verify parity

For each Tier-1 harness:

```bash
# Build
agentplugins build --target claude
agentplugins build --target codex
agentplugins build --target opencode
agentplugins build --target pimono

# Validate
agentplugins validate

# Install and smoke-test locally
agentplugins add ./  # installs from local path
```

Confirm the **same observable behaviour** on all four: same hooks fire, same commands work, same tools are reachable.

---

## What stays out

- **Universal orchestration runtime** — don't build one. Subagent spawning = per-harness primitives (v0.4.0) + userland provider protocol.
- **Mechanical ports** — don't translate existing config files 1:1. Rewrite on the manifest; let adapters generate the platform-native output.
- **v0.4.0 primitives** — `continueWith` and `nativeEntry` are not yet released. If your plugin needs them, note the gap and open a primitive proposal.

---

## See also

- [Ecosystem](/guide/ecosystem) — plugins already rewritten for Tier-1 parity
- [Tier-1 Capability Matrix](/reference/compat-matrix) — full capability table
- [Creating Plugins](/guide/creating-plugins) — authoring guide from scratch
