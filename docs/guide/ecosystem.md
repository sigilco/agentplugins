---
title: Ecosystem
description: Community plugins built on the AgentPlugins universal manifest, installable across all Tier-1 harnesses.
---

# Ecosystem

Community plugins rewritten on the AgentPlugins universal manifest. Each targets functional parity across the four supported harnesses — the same functionality across Claude Code, Codex, OpenCode, and Pi Mono.

Install any plugin with a single command:

```bash
agentplugins add owner/repo
```

This installs the plugin into `~/.agents/plugins/<name>/` and symlinks it to every detected agent on your machine.

---

## Adding your plugin

1. Build on the AgentPlugins universal manifest (see [Creating Plugins](/guide/creating-plugins))
2. Target all four supported harnesses and confirm functional parity
3. Open a PR or issue to add your plugin to this page

See [Rewriting for Tier-1 Parity](/guide/porting) for the step-by-step process.

---

## Available plugins

| Plugin | Description |
|---|---|
| [agentplugins-autoresearch](https://github.com/sigilco/agentplugins-autoresearch) | Autonomous experiment loop that gathers what to optimize and runs iterations until the target improves. |
| [agentplugins-goal](https://github.com/sigilco/agentplugins-goal) | Autonomous goal-completion loop — set a goal once, the agent iterates until done across all supported harnesses. |
| [agentplugins-ponytail](https://github.com/sigilco/agentplugins-ponytail) | Lazy senior dev mode — forces the minimum solution that works: YAGNI → stdlib → native → one line. |
| [agentplugins-caveman](https://github.com/sigilco/agentplugins-caveman) | Ultra-compressed communication mode — cuts ~75% of output tokens while preserving full technical accuracy. |
| [agentplugins-btw](https://github.com/sigilco/agentplugins-btw) | Parallel side-thread thoughts — spin up side conversations without interrupting the main agent. |

> **Note:** Capability status per plugin lives in each plugin's README. For the harness-level baseline see the [Capability Matrix](/guide/capability-matrix).
