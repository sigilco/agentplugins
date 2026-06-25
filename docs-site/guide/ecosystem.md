---
title: Ecosystem
description: Community plugins built on the AgentPlugins universal manifest, installable across all Tier-1 harnesses.
---

# Ecosystem

Community plugins rewritten on the AgentPlugins universal manifest. Each targets **Tier-1 functional parity** — the same functionality across Claude Code, Codex, OpenCode, and Pi Mono.

Install any plugin with a single command:

```bash
agentplugins add owner/repo
```

This installs the plugin into `~/.agents/plugins/<name>/` and symlinks it to every detected agent on your machine.

---

## Available plugins

### agentplugins-caveman

A caveman-style coding workflow plugin. Provides skills, a cavecrew of subagent roles, and MCP middleware for shrinking context.

**Functionality:** skills + `agents[]` cavecrew + `mcpServers` context shrink  
**Replaces:** the 850-line custom caveman installer with `agentplugins add`

```bash
agentplugins add sigilco/agentplugins-caveman
```

| Tier-1 | Claude Code | Codex | OpenCode | Pi Mono |
|---|:---:|:---:|:---:|:---:|
| Skills | ✅ | ✅ | ✅ | ✅ |
| Cavecrew (agents[]) | ✅ | ✅ | ✅ | ✅ |
| Context shrink (mcpServers) | ✅ | ✅ | ✅ | ✅ |

---

### agentplugins-ponytail

A productivity plugin with lifecycle hooks, skills, and commands. Includes subagent start tracking.

**Functionality:** skills + lifecycle hooks + commands + `subagentStart`  
**Replaces:** ponytail's per-harness setup scripts; benchmark compatibility preserved

```bash
agentplugins add sigilco/agentplugins-ponytail
```

| Tier-1 | Claude Code | Codex | OpenCode | Pi Mono |
|---|:---:|:---:|:---:|:---:|
| Skills | ✅ | ✅ | ✅ | ✅ |
| Lifecycle hooks | ✅ | ✅ | ✅ | ✅ |
| Commands | ✅ | ✅ | ✅ | ✅ |
| subagentStart | ✅ | ✅ | ⚠️ | ✅ |

⚠️ OpenCode: no native subagent event — guided per-harness. See [compat matrix](/reference/compat-matrix).

---

## Coming in v0.4.0

| Plugin | Description | Primitive |
|---|---|---|
| agentplugins-goal | Autonomous goal-loop across all Tier-1 | `continueWith` (4.1) |
| agentplugins-btw | Parallel side-thread thoughts | native passthrough (4.2) |
| agentplugins-flow | Subagent orchestration via provider protocol | `spawnChild` (4.3) |

---

## Adding your plugin

1. Build on the AgentPlugins universal manifest (see [Creating Plugins](/guide/creating-plugins))
2. Target all four Tier-1 harnesses and confirm functional parity
3. Open a PR or issue to add your plugin to this page

See [Rewriting for Tier-1 Parity](/guide/porting) for the step-by-step process.
