---
description: Learn how AgentPlugins solves plugin fragmentation across AI agent frameworks
---

# Introduction

AgentPlugins is a distribution-first toolchain for AI agent plugins. Write a plugin once, ship it to every supported agent harness from a single manifest.

## The problem

Every AI agent framework ships its own plugin system with its own manifest format, hook lifecycle, and handler conventions:

| Framework | Manifest | Handler types |
|---|---|---|
| Claude Code | `.claude-plugin/plugin.json` | command, http, prompt |
| Codex CLI | `.codex-plugin/plugin.json` | command only |
| GitHub Copilot CLI | `plugin.json` | command, http, prompt |
| Gemini CLI | `gemini-extension.json` | command only |
| Kimi | `kimi.plugin.json` | command only |
| OpenCode | TypeScript plugins | inline only |
| Pi Mono | TypeScript extensions | inline only |

**Seven frameworks, seven different APIs.** A plugin author who wants reach across the ecosystem maintains seven forks of the same logic. Users who switch harnesses lose every plugin they configured.

## The solution

AgentPlugins introduces a **universal manifest** (`agentplugins.config.ts`) and a **universal store** (`~/.agents/plugins/`). You declare hooks, skills, tools, MCP servers, and commands once. The CLI compiles that manifest down to each platform's native format and symlinks the result into every detected agent.

```
Your Plugin → AgentPlugins Core (Universal IR) → Platform Adapters → 7 Agent Harnesses
```

## Distribution-first model

The primary user action is `agentplugins add <source>`. That single command:

1. Clones or fetches the plugin from GitHub (or a local path).
2. Installs it into the universal store at `~/.agents/plugins/<name>/`.
3. Detects every agent harness installed on the machine.
4. Symlinks the plugin into each agent's skill/plugin path.

```
~/.agents/plugins/<name>/              # source of truth (universal store)
  ├── SKILL.md
  ├── agentplugins.config.ts
  ├── hooks/
  └── ...

~/.claude/skills/<name>                # symlink → ~/.agents/plugins/<name>
~/.codex/skills/<name>                 # symlink
~/.config/opencode/skills/<name>       # symlink
...                                     # fan-out to all detected agents
```

The universal store is the single source of truth. Remove a plugin once and every symlink disappears. Update once and every harness sees the new version.

## Supported platforms

Seven harnesses are supported as first-class compile targets:

| Agent | Binary | Skill path |
|---|---|---|
| Claude Code | `claude` | `~/.claude/skills` |
| Codex CLI | `codex` | `~/.codex/skills` |
| GitHub Copilot CLI | `copilot` | `~/.copilot/skills` |
| Gemini CLI | `gemini` | `~/.gemini/skills` |
| Kimi | `kimi` | `~/.kimi/skills` |
| OpenCode | `opencode` | `~/.config/opencode/skills` |
| Pi Mono | `pi` | `~/.pi/extensions` |

See the [agent paths reference](/reference/agent-paths) for the full registry and the [adapters reference](/reference/adapters) for what each platform emits.

## Where to go next

- [Install](/guide/installation) the CLI.
- Walk through the [quick start](/guide/quick-start).
- Learn the [manifest format](/guide/manifest).
