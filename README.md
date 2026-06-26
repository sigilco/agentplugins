# AgentPlugins

> **Install any plugin into every AI agent with one command.**

AgentPlugins is a plugin manager for AI agent harnesses. Install a plugin once — it's symlinked into Claude, Codex, Copilot, Gemini, Kimi, OpenCode, and Pi Mono automatically. Includes a codegen toolkit for authors who want to write once and compile to all platforms.

```bash
agentplugins add user/awesome-plugin
# → Clones, parses manifest, symlinks to every detected agent
```

## Install

**5 ways to install AgentPlugins:**

```bash
# 1. npm / npx / bunx
npx @agentplugins/cli add user/awesome-plugin
bunx @agentplugins/cli add user/awesome-plugin

# 2. Homebrew
brew install sigilco/tap-agentplugins/agentplugins

# 3. curl (macOS + Linux)
curl -fsSL https://raw.githubusercontent.com/sigilco/agentplugins/main/scripts/install.sh | bash

# 4. mise (via UBI)
mise use -g ubi:sigilco/agentplugins

# 5. GitHub Releases (prebuilt binaries)
# → https://github.com/sigilco/agentplugins/releases
```

Verify installation:

```bash
agentplugins doctor
```

## Available Plugins

Community plugins install with one command — see the [Ecosystem page](https://agentplugins.pages.dev/guide/ecosystem) for the full list:

| Plugin | Description |
|---|---|
| [agentplugins-autoresearch](https://github.com/sigilco/agentplugins-autoresearch) | Autonomous experiment/optimization loop. |
| [agentplugins-goal](https://github.com/sigilco/agentplugins-goal) | Autonomous goal-completion loop across Tier-1. |
| [agentplugins-ponytail](https://github.com/sigilco/agentplugins-ponytail) | Lazy senior dev mode — minimal working solutions. |
| [agentplugins-caveman](https://github.com/sigilco/agentplugins-caveman) | Ultra-compressed token-savvy communication. |
| [agentplugins-btw](https://github.com/sigilco/agentplugins-btw) | Parallel side-thread thoughts. |

```bash
agentplugins add sigilco/agentplugins-ponytail
```

## Quick Start

### Install a Plugin

```bash
# From a GitHub URL or user/repo shorthand
agentplugins add user/my-plugin

# List installed plugins
agentplugins list

# Show details
agentplugins info my-plugin

# Update to latest
agentplugins update my-plugin
# or update all
agentplugins update --all

# Remove
agentplugins remove my-plugin
```

Plugins are stored in a universal store (`~/.agents/plugins/<name>/`) and symlinked into each agent's plugin directory. Skills.sh-compatible plugins are symlinked to `~/.agents/skills/` as well.

### Create a Plugin (Authors)

```bash
# Interactive scaffold
agentplugins init

# With defaults
agentplugins init --yes

# From a template
agentplugins init --template security-guard
```

Templates: `minimal`, `logger` (default), `security-guard`, `formatter`.

### Build for All Platforms

```bash
# Validate manifest
agentplugins validate

# Lint for common issues
agentplugins lint

# Preview compiled output without writing
agentplugins preview
agentplugins preview --diff

# Build to dist/
agentplugins build
```

## Commands


| Command         | Description                                                 |
| --------------- | ----------------------------------------------------------- |
| `add <source>`  | Install a plugin from GitHub URL or `user/repo`             |
| `remove <name>` | Remove a plugin and unlink from all agents                  |
| `list`          | List installed plugins (`--json` for machine output)        |
| `info <name>`   | Show plugin metadata, manifest, and symlink status          |
| `update [name]` | Update plugin(s) from source (`--all` for all)              |
| `doctor`        | Diagnose store, symlinks, and agent detection               |
| `init`          | Scaffold a new plugin interactively (`--yes`, `--template`) |
| `build`         | Compile plugin for all target platforms                     |
| `validate`      | Validate manifest against schema                            |
| `lint`          | Static analysis for common issues (`--json`)                |
| `preview`       | Preview compiled output (`--diff`, `--target`)              |


## Supported Platforms


| Platform       | Store Path                    | Handler Types |
| -------------- | ----------------------------- | ------------- |
| Claude Code    | `~/.claude/skills/`           | command, http |
| OpenAI Codex   | `~/.codex/plugins/`           | command       |
| GitHub Copilot | `~/.config/github-copilot/`   | command, http |
| Google Gemini  | `~/.gemini/extensions/`       | command       |
| Kimi           | `~/.kimi/plugins/`            | command       |
| OpenCode       | `~/.config/opencode/plugins/` | inline (TS)   |
| Pi Mono        | `~/.pi/agent/extensions/`     | inline (TS)   |


## Packages


| Package                                    | Description                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `[@agentplugins/core](packages/core/)`     | Universal types, validation, lint, codegen, store                            |
| `[@agentplugins/cli](packages/cli/)`       | CLI binary (`agentplugins`)                                                  |
| `[@agentplugins/schema](packages/schema/)` | JSON Schema + TS types + Ajv validator                                       |
| `[@agentplugins/adapter-*](packages/)`     | 7 platform adapters (claude, codex, copilot, gemini, kimi, opencode, pimono) |


## Manifest

Plugins declare a manifest in `agentplugins.config.json`, `manifest.json`, or the `agentplugins` field of `package.json`:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Does something useful across agents",
  "hooks": {
    "preToolUse": {
      "matcher": "bash",
      "handler": {
        "type": "command",
        "command": "${PLUGIN_ROOT}/check.sh"
      }
    }
  },
  "skills": [{
    "name": "my-skill",
    "description": "A skill description",
    "path": "./skills/my-skill.md"
  }]
}
```

Full manifest spec: `[spec/v1/manifest.schema.json](spec/v1/manifest.schema.json)` · Docs: [agentplugins.pages.dev](https://agentplugins.pages.dev)

## Development

```bash
pnpm install
pnpm build          # Build all packages
pnpm test           # Run tests
pnpm typecheck      # Type-check all packages

# Build native binaries (requires Bun)
pnpm build:binaries

# Docs site
cd docs && pnpm install && pnpm dev
```

## Architecture

```
Plugin Source (GitHub)
    │
    ▼
┌─────────────────────────────────┐
│       AgentPlugins Store         │
│    ~/.agents/plugins/<name>/     │
└───────────┬─────────────────────┘
            │ symlinks
   ┌────────┼────────┬────────┐
   ▼        ▼        ▼        ▼
 Claude   Codex   Copilot   Gemini  ...
```

For codegen (power users):

```
Manifest → Core (validate + compile) → Adapters → Platform-native output
```

## License

Apache-2.0