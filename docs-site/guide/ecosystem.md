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

### caveman

Why use many token when few do trick. Ultra-compressed communication mode — cuts ~75% of output tokens while preserving full technical accuracy. Includes the cavecrew of subagent presets for compressed delegation.

**Functionality:** skills + `agents[]` cavecrew (investigator / builder / reviewer) + lifecycle hooks  
**Replaces:** the 850-line custom caveman installer — `agentplugins add` handles detection and symlinking across all tier-1 harnesses

```bash
agentplugins add JuliusBrussee/caveman
```

| Tier-1 | Claude Code | Codex | OpenCode | Pi Mono |
|---|:---:|:---:|:---:|:---:|
| Skills (caveman + 6 companions) | ✅ | ✅ | ✅ | ✅ |
| Cavecrew agents[] | ✅ | ✅ | ✅ | ✅ |
| sessionStart hook | ✅ | ✅ | ✅ | ✅ |

> **Note:** The `caveman-shrink` MCP proxy utility is not declared in `mcpServers` — it wraps an existing server rather than acting as a standalone one. See `src/mcp-servers/caveman-shrink/README.md` for manual setup.

---

### ponytail

He says nothing. He writes one line. It works. Lazy senior dev mode — forces the minimum solution that works: YAGNI → stdlib → native → one line.

**Functionality:** skills + lifecycle hooks + 6 slash commands + `subagentStart`  
**Replaces:** ponytail's per-harness install scripts; promptfoo benchmark preserved and unchanged

```bash
agentplugins add DietrichGebert/ponytail
```

| Tier-1 | Claude Code | Codex | OpenCode | Pi Mono |
|---|:---:|:---:|:---:|:---:|
| Skills (ponytail + 5 sub-skills) | ✅ | ✅ | ✅ | ✅ |
| sessionStart + userPromptSubmit | ✅ | ✅ | ⚠️ | ✅ |
| subagentStart | ✅ | ✅ | ⚠️ | ✅ |
| Commands (/ponytail + 5 variants) | ✅ | ✅ | ✅ | ✅ |

⚠️ OpenCode: `subagentStart` and `userPromptSubmit` have no native equivalent — these hooks are ignored with a WARN. See [compat matrix](/reference/compat-matrix).

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
