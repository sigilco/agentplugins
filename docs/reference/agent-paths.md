# Agent Paths

AgentPlugins scans the local machine for installed agent harnesses and fans plugin symlinks out to each one. This page is the authoritative registry of those paths.

## The universal store

Every installed plugin lives in one place:

| Path | Purpose |
|---|---|
| `~/.agents/plugins/` | Universal plugin store — the source of truth. |
| `~/.agents/skills/` | Skills compatibility directory (also scanned). |

`~/.agents/plugins/<name>/` is canonical. Removing a plugin from the store removes every symlink. Updating a plugin in the store updates every agent that links to it.

::: tip
Skills placed in `~/.agents/skills/` are picked up and fanned out exactly like plugins in the universal store. Existing setups require no migration.
:::

## Detected agents

Seven agent harnesses are supported:

| Agent | Display name | Skill path | Binary | Manifest path |
|---|---|---|---|---|
| Claude Code | Claude Code | `~/.claude/skills` | `claude` | `~/.claude.json` |
| Codex CLI | Codex CLI | `~/.codex/skills` | `codex` | `~/.codex/config.json` |
| OpenCode | OpenCode | `~/.config/opencode/skills` | `opencode` | `~/.config/opencode/config.json` |
| Kimi | Kimi | `~/.kimi/skills` | `kimi` | `~/.kimi/config.json` |
| Gemini CLI | Gemini CLI | `~/.gemini/skills` | `gemini` | `~/.gemini/settings.json` |
| GitHub Copilot CLI | GitHub Copilot CLI | `~/.copilot/skills` | `copilot` | `~/.copilot/config.json` |
| Pi Mono | Pi Mono | `~/.pi/extensions` | `pi` | `~/.pi/config.json` |

## How detection works

`agentplugins doctor` and `agentplugins add` detect agents by checking for the binary on `PATH` and the skill path on disk. An agent is considered **installed** if either the binary is resolvable or the skill path exists.

```text
AgentPlugins doctor
────────────────────────────────────────
CLI version      0.2.0
Store path       ~/.agents/plugins       ✓
Skills path      ~/.agents/skills        ✓

Detected agents
  claude         ~/.claude/skills        ✓
  codex          ~/.codex/skills         ✓
  opencode       ~/.config/opencode      ✓
  gemini         ~/.gemini/skills        ✗ (not installed)
  copilot        ~/.copilot/skills       ✓
  kimi           ~/.kimi/skills          ✗ (not installed)
  pimono         ~/.pi/extensions        ✗ (not installed)

4 agents detected.
```

::: warning
`agentplugins add` only symlinks into detected agents. If you install a new harness later, run `agentplugins update --all` to fan existing plugins out to the new agent.
:::

## Symlink layout

After installing a plugin, the universal store and the per-agent skill paths look like this:

```
~/.agents/plugins/
  └── my-plugin/                    # source of truth
      ├── agentplugins.config.ts
      ├── SKILL.md
      └── hooks/

~/.claude/skills/my-plugin          → symlink to ~/.agents/plugins/my-plugin
~/.codex/skills/my-plugin           → symlink
~/.config/opencode/skills/my-plugin → symlink
~/.copilot/skills/my-plugin         → symlink
~/.gemini/skills/my-plugin          → symlink
~/.kimi/skills/my-plugin            → symlink
~/.pi/extensions/my-plugin          → symlink
```

Each agent reads from its own skill path, unaware that the contents are shared.

## Overriding paths

You can override the store path with the `--store` global flag:

```bash
agentplugins --store /custom/store add user/my-plugin
```

There is no override for per-agent skill paths — those are determined by each agent's own conventions and are not configurable.

## Registry source

The path registry is published as a machine-readable JSON document:

| Source | URL |
|---|---|
| Hosted | `__DOCS_SITE__/schema/v1/agent-paths.json` |
| Raw (GitHub) | `https://raw.githubusercontent.com/sigilco/agentplugins/main/spec/v1/agent-paths.json` |

```json
{
  "store": { "path": "~/.agents/plugins" },
  "skillsCompat": { "path": "~/.agents/skills" },
  "agents": [
    {
      "name": "claude",
      "displayName": "Claude Code",
      "skillPath": "~/.claude/skills",
      "binary": "claude",
      "manifestPath": "~/.claude.json"
    }
    // ...
  ]
}
```

## Next steps

- [Adapters reference](/reference/adapters) — what each agent's adapter emits.
- [Skills guide](/guide/skills) — the `SKILL.md` format.
- [Installation](/guide/installation) — installing the CLI.
