# AgentPlugins Spec v1

The **public contract** for the AgentPlugins ecosystem. A single plugin manifest compiles to any supported agent harness.

## Normative Artifacts

| File | Purpose |
|---|---|
| [`manifest.schema.json`](./manifest.schema.json) | The plugin manifest JSON Schema. Source of truth for v1. |
| [`adapter.schema.json`](./adapter.schema.json) | The adapter ABI contract (JSON process ABI). |
| [`agent-paths.json`](./agent-paths.json) | Community-maintained registry of well-known agent skill paths. |

## Distribution Model

AgentPlugins is **distribution-first**; the primary user action is `agentplugins add <source>`, which clones/parses a plugin and symlinks it into every detected agent harness from the universal store:

```
~/.agents/plugins/<name>/              # source of truth (universal store)
  ├── SKILL.md
  ├── agentplugins.json                 # manifest (optional)
  ├── hooks.json
  └── ...

~/.claude/skills/<name>                # symlink → ~/.agents/plugins/<name>
~/.codex/skills/<name>                 # symlink
~/.config/opencode/skills/<name>       # symlink
...                                     # 7+ symlinks fanned out
```

`agentplugins.json` declares what a plugin provides. `SKILL.md` (Skills.sh-compatible) is treated as `skills[0]`. The CLI scans both `~/.agents/plugins/` and `~/.agents/skills/` for compatibility.

## Manifest

A manifest is a JSON document with the following top-level fields. The keywords **MUST**, **MUST NOT**, **SHOULD**, and **SHOULD NOT** in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

### Required fields

- **`name`** (`string`) — Plugin identifier. MUST be kebab-case (`^[a-z][a-z0-9-]*$`), max 64 chars. MUST NOT be prefixed with `agentplugin`.
- **`version`** (`string`) — Semantic version ([semver](https://semver.org/)).
- **`description`** (`string`) — Short human-readable description (SHOULD be ≥ 10 chars).

### Component types

| Field | Type | Description |
|---|---|---|
| `skills` | `Skill[]` | Skills (SKILL.md-compatible) |
| `mcpServers` | `Record<string, MCPServerConfig>` | MCP servers to start |
| `hooks` | `UniversalHooks` | Universal hook definitions |
| `tools` | `ToolDefinition[]` | Tools provided |
| `commands` | `Command[]` | Slash commands |
| `agents` | `Agent[]` | Subagent definitions |
| `rules` | `Rule[]` | Behavioral rules |
| `lspServers` | `LSPServer[]` | LSP server configs |

### Handler types

Hooks declare a `handler` of one of:

- **`command`** — Shell command. Paths MUST be `./`-prefixed (no `..` traversal).
- **`http`** — POST hook context to a URL.
- **`reference`** — Namespaced reference to a handler in the plugin module (`{plugin}:{component}`).

### Placeholder expansion

Paths and commands support:

- `${PLUGIN_ROOT}` — Resolves to the plugin's directory in the universal store.
- `${PLUGIN_DATA}` — Resolves to a per-plugin data directory (`~/.agents/plugins/<name>/data`).
- `${HOME}` — User home directory.

### Namespacing

All components (skills, tools, commands, agents) are namespaced as `{plugin}:{component}` to avoid collisions when multiple plugins are installed.

## Adapter ABI

An adapter is any executable that implements the **JSON process ABI**: read a manifest (stdin or `--manifest <file>`), compile platform-specific output, write files, and exit `0` (success) or non-zero (failure). This enables any-language adapters without SDK lock-in. See [`adapter.schema.json`](./adapter.schema.json).

## Schema consumption

- npm: `@agentplugins/schema` (JSON Schema + generated TS types + Ajv validators)
- Hosted: `https://agentplugins.pages.dev/schema/v1.json`
- Raw: `https://raw.githubusercontent.com/sigilco/agentplugins/main/spec/v1/manifest.schema.json`

Include `"$schema": "https://agentplugins.pages.dev/schema/v1.json"` in your manifest for editor autocomplete in VS Code, JetBrains, and any JSON-Schema-aware editor.

## Versioning

This spec follows SemVer. The v1 series is backwards-compatible. Breaking changes ship as v2.
