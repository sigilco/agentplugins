---
title: Creating Plugins – AgentPlugins
description: Step-by-step guide to authoring an AgentPlugins manifest and shipping to seven AI agent harnesses.
---

# Creating Plugins

This guide walks through creating a plugin from scratch: scaffolding, writing hooks, adding skills and MCP servers, building, testing, and publishing.

## 1. Scaffold

Run `agentplugins init` to bootstrap a plugin from a template:

```bash
agentplugins init
```

You'll be prompted for:

- **Plugin name** — kebab-case identifier.
- **Description** — minimum 10 characters.
- **Template** — one of the starter templates.
- **Targets** — which platforms to compile for (default: all).

### Templates

| Template | What you get |
|---|---|
| `minimal` | Bare manifest. Good starting point. |
| `logger` | A plugin that logs every hook event to `${PLUGIN_DATA}/log.jsonl`. |
| `security-guard` | A `preToolUse` block-list for dangerous commands. |
| `formatter` | A `postToolUse` hook that runs your formatter of choice. |

Pick `minimal` if you're not sure — you can add hooks later.

```text
? Plugin name (kebab-case) › my-plugin
? Description › Does awesome things across every agent
? Template › minimal
? Targets › claude, codex, copilot, gemini, kimi, opencode, pimono

✓ Created my-plugin/
  my-plugin/agentplugins.config.ts
  my-plugin/package.json
  my-plugin/tsconfig.json
  my-plugin/.gitignore
  my-plugin/README.md
```

Hooks, skills, and commands are declared inline in `agentplugins.config.ts` — there is no separate `SKILL.md` or `hooks/` directory in the scaffold. Open `agentplugins.config.ts` to start editing.

## 2. Write hooks

Open `agentplugins.config.ts` and add hooks to the `hooks` object. See the [Hooks guide](/guide/hooks) for the 19 universal hooks and the three handler types.

```typescript
import { definePlugin } from '@agentplugins/core'

export default definePlugin({
  name: 'my-plugin',
  version: '1.0.0',
  description: 'Does awesome things across every agent',

  hooks: {
    preToolUse: {
      matcher: 'bash',
      handler: {
        type: 'command',
        command: '${PLUGIN_ROOT}/hooks/pre-tool-use.sh',
      },
    },
    sessionStart: {
      handler: {
        type: 'inline',
        handler: async () => ({
          additionalContext: 'my-plugin is active.',
        }),
      },
    },
  },
})
```

### `defineConfig` — extended config format

Use `defineConfig` instead of `definePlugin` when you need to:

- Target a **subset of platforms** without editing the manifest
- Wire in a **private adapter** for an internal harness
- Add **build pipeline plugins** (custom lint rules, IR transforms, post-emit hooks)

```typescript
import { defineConfig } from '@agentplugins/core'

export default defineConfig({
  manifest: {
    name: 'my-plugin',
    version: '1.0.0',
    description: 'Does awesome things across every agent',
    hooks: { /* ... */ },
  },

  // Override which targets are built — does not affect the manifest
  targets: ['claude', 'codex'],
})
```

`definePlugin` and `defineConfig` produce the same dist output for the same manifest. Pick `definePlugin` for simple cross-platform plugins; reach for `defineConfig` when you need the extras above.

See [Extending the Build Pipeline](/guide/extending) for `plugins: [...]` and custom adapters.

::: tip
Place hook scripts under `hooks/` and reference them with `${PLUGIN_ROOT}/hooks/...`. The placeholder resolves to the plugin's directory in the universal store at runtime.
:::

## 3. Add skills

Drop a `SKILL.md` file into `skills/<skill-name>/`:

```bash
mkdir -p skills/my-skill
$EDITOR skills/my-skill/SKILL.md
```

```markdown
---
name: my-skill
description: Teaches the agent how to do something specific.
tags:
  - productivity
---

# My Skill

When the user asks to do X, follow these steps:

1. ...
2. ...
```

Then declare it in the manifest:

```typescript
skills: [
  {
    name: 'my-skill',
    description: 'Teaches the agent how to do something specific.',
    path: './skills/my-skill/SKILL.md',
    tags: ['productivity'],
  },
],
```

See the [Skills guide](/guide/skills) for the full `SKILL.md` spec.

## 4. Add MCP servers

Wire external tools and data sources into the agent with [MCP servers](/guide/mcp-servers):

```typescript
mcpServers: {
  filesystem: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '${HOME}/projects'],
  },
},
```

## 5. Build

Compile the manifest into each target platform's native format:

```bash
agentplugins build
```

```text
Building my-plugin@1.0.0

  claude    → dist/claude/.claude-plugin/plugin.json        ✓
  codex     → dist/codex/.codex-plugin/plugin.json          ✓
  copilot   → dist/copilot/plugin.json                      ✓
  gemini    → dist/gemini/gemini-extension.json             ✓
  kimi      → dist/kimi/kimi.plugin.json                    ✓
  opencode  → dist/opencode/plugin.ts + opencode.json       ✓
  pimono    → dist/pimono/index.ts + package.json           ✓

Built 7 targets in 142ms.
```

Inspect `dist/` to see exactly what each adapter emitted.

## 6. Test locally

Install the plugin from your local working copy to verify the symlinks land in the right place:

```bash
agentplugins add ./my-plugin
```

```text
✓ Installed my-plugin@1.0.0 from local path
✓ Symlinked to 4 detected agents.
```

Then run `list` to confirm:

```bash
agentplugins list
```

Validate the manifest and surface cross-platform issues:

```bash
agentplugins validate
```

And run the linter to catch common mistakes:

```bash
agentplugins lint
```

See [Linting](/guide/linting) for the full rule set.

## 7. Publish

Push the plugin to a public GitHub repository. Once it's on GitHub, anyone can install it:

```bash
agentplugins add your-username/my-plugin
```

### Recommended repository layout

```text
my-plugin/
├── agentplugins.config.ts     # manifest (or agentplugins.json)
├── SKILL.md                   # optional root skill
├── skills/
│   └── my-skill/
│       └── SKILL.md
├── hooks/
│   ├── pre-tool-use.sh
│   └── session-start.sh
├── bin/
│   └── my-server              # MCP server binary (if any)
├── README.md
└── LICENSE
```

::: tip
Tag releases with semver (`v1.0.0`, `v1.1.0`, ...). `agentplugins update` resolves to the latest tag, and users can pin a specific version with `agentplugins add user/repo@1.0.0`.
:::

## Next steps

- [Manifest reference](/guide/manifest) — every field.
- [Hooks](/guide/hooks) — the 19 lifecycle events.
- [Extending the Build Pipeline](/guide/extending) — custom adapters, lint rules, and pipeline plugins.
- [CLI reference](/reference/commands) — every command and flag.
