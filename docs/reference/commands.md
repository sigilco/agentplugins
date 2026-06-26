# CLI Commands

The `agentplugins` CLI exposes 11 commands. Run `agentplugins --help` to see them all, or `agentplugins <command> --help` for details on a specific command.

```text
Usage: agentplugins [options] [command]

Write AI agent plugins once, ship to any harness.

Options:
  -V, --version     output the version number
  -h, --help        display help for command

Commands:
  add       Install a plugin from a source
  remove    Remove an installed plugin
  list      List installed plugins
  update    Update one or all plugins
  info      Show details about an installed plugin
  doctor    Diagnose the local install
  build     Compile a plugin to target platforms
  validate  Validate a manifest against the schema
  init      Scaffold a new plugin
  lint      Lint a manifest against the rule set
  preview   Preview the compiled output for a target
```

## `add`

Install a plugin from a source and symlink it into every detected agent.

```bash
agentplugins add <source>
```

| Flag | Description |
|---|---|
| `--target <name>` | Restrict fan-out to a specific agent (repeatable). |
| `--force` | Overwrite an existing install. |
| `--no-symlink` | Copy files instead of symlinking. |
| `--version <semver>` | Pin a specific version (GitHub sources only). |

### Sources

| Source form | Example |
|---|---|
| `owner/repo` | `agentplugins add user/my-plugin` |
| Full GitHub URL | `agentplugins add https://github.com/user/my-plugin` |
| `owner/repo@version` | `agentplugins add user/my-plugin@1.2.0` |
| Local path | `agentplugins add ./my-plugin` |
| `gist:<id>` | `agentplugins add gist:abcdef123456` |

### Examples

```bash
# Latest release from GitHub
agentplugins add user/my-plugin

# Specific version
agentplugins add user/my-plugin@1.2.0

# Local working copy
agentplugins add ./my-plugin

# Restrict to Claude only
agentplugins add user/my-plugin --target claude
```

## `remove`

Remove a plugin from the universal store and delete its symlinks.

```bash
agentplugins remove <name>
```

| Flag | Description |
|---|---|
| `--target <name>` | Remove the symlink for one agent only. |
| `--keep-data` | Preserve `${PLUGIN_DATA}` contents. |

### Examples

```bash
agentplugins remove my-plugin
agentplugins remove my-plugin --target codex
```

## `list`

List every plugin in the universal store and which agents each is linked into.

```bash
agentplugins list
```

| Flag | Description |
|---|---|
| `--json` | Emit JSON instead of a table. |
| `--target <name>` | Filter to plugins linked into a specific agent. |

### Example

```bash
agentplugins list --json
```

```json
[
  {
    "name": "my-plugin",
    "version": "1.2.0",
    "targets": ["claude", "codex", "opencode", "copilot"]
  }
]
```

## `update`

Update one plugin or all plugins to the latest version available from its source.

```bash
agentplugins update [name]
```

| Flag | Description |
|---|---|
| `--all` | Update every installed plugin. |
| `--version <semver>` | Pin to a specific version. |
| `--dry-run` | Show what would change without writing. |

### Examples

```bash
agentplugins update my-plugin
agentplugins update --all
agentplugins update my-plugin --version 1.3.0
```

## `info`

Show details about an installed plugin: manifest, declared hooks, skills, MCP servers, and current symlinks.

```bash
agentplugins info <name>
```

| Flag | Description |
|---|---|
| `--json` | Emit JSON instead of formatted text. |

### Example

```bash
agentplugins info my-plugin
```

```text
my-plugin@1.2.0
Description:  Does awesome things across every agent
Author:       Jane Doe <jane@example.com>
License:      Apache-2.0
Repository:   https://github.com/user/my-plugin

Hooks:
  preToolUse     matcher=bash     command
  sessionStart                    inline

Skills:
  my-plugin:my-skill

MCP servers:
  filesystem

Symlinks:
  ~/.claude/skills/my-plugin
  ~/.codex/skills/my-plugin
  ~/.config/opencode/skills/my-plugin
  ~/.copilot/skills/my-plugin
```

## `doctor`

Diagnose the local install: verify the binary, the universal store, the skills compatibility directory, and detected agents.

```bash
agentplugins doctor
```

| Flag | Description |
|---|---|
| `--json` | Emit JSON instead of formatted text. |

See the sample output in [Installation](/guide/installation#verify-the-install).

## `build`

Compile a plugin manifest into each target platform's native format.

```bash
agentplugins build [path]
```

| Flag | Description |
|---|---|
| `--target <name>` | Build only one target (repeatable). |
| `--out <dir>` | Output directory. Defaults to `dist/`. |
| `--watch` | Rebuild on file change. |

### Examples

```bash
agentplugins build
agentplugins build --target claude --target codex
agentplugins build --out build/
```

## `validate`

Validate a manifest against the JSON Schema and report per-target compatibility issues.

```bash
agentplugins validate [path]
```

| Flag | Description |
|---|---|
| `--target <name>` | Validate against a specific target's constraints. |
| `--json` | Emit JSON instead of formatted text. |

### Example

```bash
agentplugins validate
```

```text
🔍 AgentPlugins Validation

claude:
  ✓ No issues found

codex:
  ⚠ hooks.sessionEnd is not supported by codex — this hook will be ignored

✅ All checks passed!
```

## `init`

Scaffold a new plugin from a template.

```bash
agentplugins init [name]
```

| Flag | Description |
|---|---|
| `--template <name>` | Template to use: `minimal`, `logger`, `security-guard`, `formatter`. |
| `--target <name>` | Declare a compile target (repeatable). Defaults to all. |
| `--no-skill` | Skip creating a root `SKILL.md`. |

### Examples

```bash
agentplugins init my-plugin --template security-guard
agentplugins init my-plugin --target claude --target opencode
```

## `lint`

Lint a manifest against the eight built-in rules. See the [Linting guide](/guide/linting) for the full rule set.

```bash
agentplugins lint [path]
```

| Flag | Description |
|---|---|
| `--json` | Emit JSON instead of formatted text. |
| `--max-warnings <n>` | Fail when warning count exceeds `n`. |
| `--rule <name>` | Run only one rule (repeatable). |

### Examples

```bash
agentplugins lint
agentplugins lint --json
agentplugins lint --rule secrets --rule naming
```

## `preview`

Preview the compiled output for a specific target without writing files. Useful for debugging adapter behavior.

```bash
agentplugins preview --target <name> [path]
```

| Flag | Description |
|---|---|
| `--target <name>` | Target to preview (required). |
| `--out <file>` | Write the preview to a file instead of stdout. |

### Example

```bash
agentplugins preview --target opencode
```

```typescript
// opencode preview of my-plugin@1.0.0
import type { Plugin } from 'opencode'

export default function (): Plugin {
  return {
    name: 'my-plugin',
    hooks: {
      'tool.execute.before': async (ctx) => {
        if (ctx.tool.name === 'bash') {
          // ...preToolUse handler
        }
      },
    },
  }
}
```

## Global flags

These work on every command:

| Flag | Description |
|---|---|
| `-V, --version` | Print the CLI version and exit. |
| `-h, --help` | Print help text and exit. |
| `--no-color` | Disable colored output. |
| `--store <path>` | Override the universal store path (defaults to `~/.agents/plugins`). |

## Next steps

- [Quick start](/guide/quick-start) — a five-command walkthrough.
- [Linting](/guide/linting) — the eight rules in depth.
- [JSON Schema](/reference/schema) — programmatic validation.
