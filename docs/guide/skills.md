---
description: Reusable agent capabilities via SKILL.md
---

# Skills

A **skill** is a markdown document with YAML frontmatter that teaches an agent a reusable capability. Existing `SKILL.md` files work without modification.

## SKILL.md format

A skill is a markdown file named `SKILL.md` with a YAML frontmatter block:

```markdown
---
name: security-guard
description: Enforces security policies when executing shell commands.
tags:
  - security
  - safety
---

# Security Guard

When executing shell commands, validate against the following policies:

1. Never run `rm -rf /` or any recursive deletion of system paths.
2. Never pipe untrusted input into `eval` or `sh -c`.
3. Prompt for confirmation before any network egress to an unknown host.
```

### Frontmatter fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | `string` | yes | Skill identifier. Kebab-case. |
| `description` | `string` | yes | One-line description shown to the agent. |
| `tags` | `string[]` | no | Discovery tags. |

The body of the file is free-form markdown. Agents read it as instructions when the skill is active.

## How `agentplugins add` reads skills

When you run `agentplugins add user/my-plugin`, the CLI looks for skills in this order:

1. A declared manifest (`agentplugins.config.ts` or `agentplugins.json`) with a `skills` array.
2. A `SKILL.md` file at the plugin root.
3. A `skills/` directory containing nested `SKILL.md` files.

If only a `SKILL.md` is present, AgentPlugins **synthesizes a manifest** from the frontmatter:

- `name` ← `SKILL.md` frontmatter `name` (or the directory name).
- `version` ← `0.1.0` if no `package.json` is present.
- `description` ← `SKILL.md` frontmatter `description`.
- `skills[0]` ← the `SKILL.md` itself.

This means a bare `SKILL.md` repo is a valid AgentPlugins plugin — no manifest authoring required.

```bash
agentplugins add user/cool-skill
```

```text
✓ No manifest found — synthesizing from SKILL.md
✓ cool-skill@0.1.0 (description: "Cool skill does cool things")
✓ Symlinked to 4 detected agents.
```

## Symlink behavior

Installed skills live in the universal store and are symlinked into each agent's skill path:

```
~/.agents/plugins/<plugin-name>/
  └── skills/
      └── <skill-name>/
          └── SKILL.md

~/.claude/skills/<plugin-name>           → symlink
~/.codex/skills/<plugin-name>            → symlink
~/.config/opencode/skills/<plugin-name>  → symlink
...
```

::: tip
AgentPlugins also picks up skills placed in `~/.agents/skills/`, so existing setups require no migration.
:::

## Declaring skills in a manifest

For plugins with multiple skills or non-default metadata, declare them explicitly in `agentplugins.config.ts`:

```typescript
import { definePlugin } from '@agentplugins/core'

export default definePlugin({
  name: 'my-bundle',
  version: '1.0.0',
  description: 'A bundle of related skills',

  skills: [
    {
      name: 'security-guard',
      description: 'Security policy enforcement',
      path: './skills/security-guard/SKILL.md',
      tags: ['security', 'safety'],
    },
    {
      name: 'format-on-save',
      description: 'Auto-format files after edit',
      path: './skills/format-on-save/SKILL.md',
      tags: ['formatting'],
    },
  ],
})
```

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | Skill identifier. |
| `description` | `string` | One-line description shown to the agent. |
| `path` | `string` | Relative path to the `SKILL.md` body. |
| `tags` | `string[]` | Optional discovery tags. |
| `content` | `string` | Inline markdown body (alternative to `path`). |

You can use `path` (preferred for multi-file plugins) or `content` (preferred for single-file plugins).

## Namespacing

All skills are namespaced as `{plugin}:{skill}` when installed to avoid collisions across plugins. A skill named `guard` in plugin `my-bundle` is exposed as `my-bundle:guard`.

## Next steps

- [Creating plugins](/guide/creating-plugins) — scaffold a plugin with skills.
- [Manifest reference](/guide/manifest) — every manifest field.
- [Agent paths](/reference/agent-paths) — where skills are symlinked per platform.
