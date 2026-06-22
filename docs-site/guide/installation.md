---
description: Install the AgentPlugins CLI via npm, Homebrew, curl, or mise
---

# Installation

AgentPlugins ships as a single Bun-compiled binary — no Node runtime required. Pick whichever install method fits your environment.

## npm / npx

The CLI is published to npm as `@agentplugins/cli`. Run it ad-hoc with `npx`:

```bash
npx @agentplugins/cli@latest --version
```

Or install globally:

```bash
npm install -g @agentplugins/cli
agentplugins --version
```

## Homebrew

Install from the_sigilco tap:

```bash
brew install sigilco/tap/agentplugins
```

Or install directly from the formula URL:

```bash
brew install https://raw.githubusercontent.com/sigilco/agentplugins/main/homebrew/Formula/agentplugins.rb
```

Upgrade with `brew upgrade agentplugins`.

## curl

The install script downloads the correct prebuilt binary for your platform and drops it into `/usr/local/bin`:

```bash
curl -fsSL https://agentplugins.dev/install.sh | bash
```

::: tip
Inspect the script before running it: `curl -fsSL https://agentplugins.dev/install.sh | less`.
:::

## mise

Manage AgentPlugins as a version-pinned tool with [mise](https://mise.jdx.dev/) (uses [ubi](https://github.com/houseabsolute/ubi) under the hood to pull GitHub releases):

```bash
mise use -g ubi:sigilco/agentplugins
```

This pins the latest release globally. Use `mise use ubi:sigilco/agentplugins@1.2.0` to pin a specific version per project.

## Bun

If you have [Bun](https://bun.sh/) installed, run the compiled binary directly via `bunx`:

```bash
bunx @agentplugins/cli@latest --version
```

## Verify the install

Whichever method you chose, confirm the binary is on your `PATH`:

```bash
agentplugins --version
# agentplugins 1.0.0
```

Then run `doctor` to verify AgentPlugins can detect every installed agent harness on your machine:

```bash
agentplugins doctor
```

```text
AgentPlugins doctor
────────────────────────────────────────
CLI version      1.0.0
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

4 agents detected. Plugins will fan out to those harnesses.
```

::: warning
`doctor` only reports detection. Plugins still install to the universal store (`~/.agents/plugins/`) regardless of how many agents are found. Symlinks are created only for detected agents.
:::

## Next steps

- [Quick start](/guide/quick-start) — install your first plugin.
- [Creating plugins](/guide/creating-plugins) — scaffold a new plugin from a template.
