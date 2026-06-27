---
title: Porting an Existing Plugin
description: Port an existing per-harness plugin to the AgentPlugins universal manifest with functional parity across Tier-1 harnesses.
---

# Porting an Existing Plugin

This guide walks through porting an existing per-harness plugin to AgentPlugins so it delivers the **same functionality** everywhere — universal codegen first, per-harness escape hatch only when a capability has no universal primitive.

::: info Tier-1 parity is the bar
The four Tier-1 harnesses are **Claude Code, Codex, OpenCode, and Pi Mono**. A capability must work across all four at the *functionality* level — not necessarily with identical TUI chrome, but the same underlying behaviour. See the [Tier-1 Capability Matrix](/reference/compat-matrix) for the per-capability verdict.
:::

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
   NO  → open a primitive proposal (don't block the port)
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

### Authoring primitives available in the manifest

These ship as of v0.4.0+ — reach for them before falling back to per-harness code:

- **`continueWith`** — chain a follow-up prompt into the session via the `stop` hook (per-session cap of 20; lint-guarded).
- **`nativeEntry` / `nativeCopies`** — pass non-JS artifacts (binaries, hand-written TS) through to a specific harness.
- **`adapterOverrides`** — override a single adapter's output per-harness (`manifest.adapterOverrides.opencode` / `.pimono`); paths are sanitized against the plugin root.
- **`capabilities: ['subprocess']`** — declares a capability so the build-time lint rules don't flag subprocess patterns in your command handlers.

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

**Per-harness fallback via `nativeEntry`:**

Provide a hand-written TS file for code-emitting adapters:

```typescript
// agentplugins.config.ts
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

- Implement the TUI feature on Pi via `nativeEntry`.
- On other Tier-1: omit the widget; the underlying functionality (data, hooks, state) must still work.
- Record in compat matrix as "TUI fidelity — Pi only".

---

## Step 5 — Security & setup on install

When you (or your users) run `agentplugins add <your-plugin>`, the install flow does a few things automatically that affect how you should ship your port. You don't need to do anything for most of these — just be aware.

::: tip Setup scripts (optional)
If your plugin needs a one-shot install step (generate a config, fetch a model, seed data), declare a top-level **`setup`** command in the manifest:

```json
{ "name": "my-plugin", "version": "1.0.0", "setup": "./scripts/install.sh" }
```

After `agentplugins add`, the CLI prompts for trust and runs it. `agentplugins setup my-plugin` re-runs it later. If you don't declare `setup`, the CLI auto-detects `install.sh` → `setup.sh` → `postinstall.mjs` → `postinstall.js` (first hit). This is **distinct from the `hooks.setup` lifecycle hook**, which fires on session setup.
:::

Trust is on-first-use: the command plus the contents of any referenced script are hashed (sha256) and recorded in `.agentplugins-meta.json`. A matching hash re-runs silently next time; a changed hash re-prompts.

**What's always enforced on install** (no opt-out — these protect the user):

- **Hard denylist** blocks pipe-to-shell and destructive commands (`curl|sh`, `wget|sh`, `npx --yes`, `rm -rf /`, `chmod 777`, `eval`, `base64 -d|sh`) even if the user passes `--yes` or has trusted the plugin before.
- **Integrity check** — if you declare `manifest.integrity`, the cloned source is verified against it before linking.
- **Clone URL is validated** to `https://github.com/...` (GitHub-only) before fetch; redirects are re-checked against private-IP / allow-lists (SSRF guard).
- **Symlink-safe** — install only `unlinkSync`s existing entries; it never `rmSync`s user files.

Flags the user controls: `--yes` (skip the prompt, still denylist-gated), `--no-setup` (skip setup on `add`), and `AGENTPLUGINS_SETUP_SCRIPTS=0` (hard kill-switch).

---

## Step 6 — Verify parity

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

- **Universal orchestration runtime** — don't build one. Subagent spawning = per-harness primitives + userland provider protocol.
- **Mechanical ports** — don't translate existing config files 1:1. Rewrite on the manifest; let adapters generate the platform-native output.

---

## See also

- [Ecosystem](/guide/ecosystem) — plugins already ported for Tier-1 parity
- [Tier-1 Capability Matrix](/reference/compat-matrix) — full capability table
- [Creating Plugins](/guide/creating-plugins) — authoring guide from scratch
- [JSON Schema](/reference/schema) — manifest schema for editor autocomplete
