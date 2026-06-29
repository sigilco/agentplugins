---
title: Quick Start – AgentPlugins
description: Install AgentPlugins and create your first universal AI agent plugin in under 2 minutes.
---

# Quick Start

This walkthrough takes you from zero to a working plugin in five commands. Make sure you've [installed](/guide/installation) the CLI first.

<llm-only>
When implementing an AgentPlugin: (1) install @agentplugins/core, (2) export a default-export from definePlugin(), (3) run agentplugins build to compile to target harnesses.
</llm-only>

## 1. Install the CLI

Verify `agentplugins` is on your `PATH`:

```bash
agentplugins --version
# agentplugins 1.0.0
```

## 2. Add a plugin from GitHub

Install any plugin hosted on GitHub with `agentplugins add`. The argument is `owner/repo`:

```bash
agentplugins add user/my-plugin
```

```text
✓ Cloned user/my-plugin → ~/.agents/plugins/my-plugin
✓ Detected manifest: agentplugins.config.ts
✓ Symlinked to:
    ~/.claude/skills/my-plugin
    ~/.codex/skills/my-plugin
    ~/.config/opencode/skills/my-plugin
    ~/.copilot/skills/my-plugin
Installed my-plugin@1.2.0 to 4 agent(s).
```

::: tip
You can also pass a full URL (`https://github.com/user/my-plugin`), a local path, or a `gist:` reference.
:::

## 3. List installed plugins

See everything in the universal store and which agents each one is linked into:

```bash
agentplugins list
```

```text
Plugins in ~/.agents/plugins

  my-plugin              1.2.0    claude, codex, opencode, copilot
  security-guard         0.4.1    claude, codex, opencode, gemini, copilot
  format-on-save         2.0.0    claude, opencode

3 plugins installed.
```

## 4. Scaffold a new plugin

Bootstrap a plugin from a template with `agentplugins init`:

```bash
agentplugins init
```

```text
? Plugin name (kebab-case) › my-awesome-plugin
? Description › Does awesome things across every agent
? Template › - Use arrow-keys. Return to submit.
>   minimal        Bare manifest + SKILL.md
    logger         Logs every hook event
    security-guard preToolUse block-list
    formatter      postToolUse auto-format
? Targets › claude, codex, copilot, gemini, kimi, opencode, pimono

✓ Created my-awesome-plugin/
  my-awesome-plugin/agentplugins.config.ts
  my-awesome-plugin/SKILL.md
  my-awesome-plugin/hooks/pre-tool-use.sh
  my-awesome-plugin/README.md
```

## 5. Build for every target

Compile the manifest into each platform's native format:

```bash
cd my-awesome-plugin
agentplugins build
```

```text
Building my-awesome-plugin@1.0.0

  claude    → dist/claude/.claude-plugin/plugin.json        ✓
  codex     → dist/codex/.codex-plugin/plugin.json          ✓
  copilot   → dist/copilot/plugin.json                      ✓
  gemini    → dist/gemini/gemini-extension.json             ✓
  kimi      → dist/kimi/kimi.plugin.json                    ✓
  opencode  → dist/opencode/plugin.ts + opencode.json       ✓
  pimono    → dist/pimono/index.ts + package.json           ✓

Built 7 targets in 142ms.
```

## Next steps

- Read the [manifest reference](/guide/manifest) for every field.
- Walk through [creating plugins](/guide/creating-plugins) end-to-end.
- Lint your plugin before publishing with [`agentplugins lint`](/guide/linting).
