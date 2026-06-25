# Claude Code Plugin System - Technical Reference Report

> Source: https://code.claude.com/docs/en/plugins-reference  
> Date: 2025

---

## Table of Contents

1. [Plugin Manifest Format](#1-plugin-manifest-format)
2. [Hook Types Available](#2-hook-types-available)
3. [Registration Mechanism](#3-registration-mechanism)
4. [Configuration Schema](#4-configuration-schema)
5. [File Structure](#5-file-structure)
6. [Constraints & Limitations](#6-constraints--limitations)
7. [Code Example: Minimal Plugin](#7-code-example-minimal-plugin)
8. [CLI Commands Reference](#8-cli-commands-reference)

---

## 1. Plugin Manifest Format

The manifest file is located at `.claude-plugin/plugin.json` in the plugin root. It is **optional** -- if omitted, Claude Code auto-discovers components in default locations and derives the plugin name from the directory name.

### Complete Schema

```json
{
  "$schema": "https://json.schemastore.org/claude-code-plugin-manifest.json",
  "name": "plugin-name",
  "displayName": "Plugin Name",
  "version": "1.2.0",
  "description": "Brief plugin description",
  "author": {
    "name": "Author Name",
    "email": "author@example.com",
    "url": "https://github.com/author"
  },
  "homepage": "https://docs.example.com/plugin",
  "repository": "https://github.com/author/plugin",
  "license": "Apache-2.0",
  "keywords": ["keyword1", "keyword2"],
  "defaultEnabled": true,
  "skills": "./custom/skills/",
  "commands": ["./custom/commands/special.md"],
  "agents": ["./custom/agents/reviewer.md"],
  "hooks": "./config/hooks.json",
  "mcpServers": "./mcp-config.json",
  "outputStyles": "./styles/",
  "lspServers": "./.lsp.json",
  "experimental": {
    "themes": "./themes/",
    "monitors": "./monitors.json"
  },
  "dependencies": [
    "helper-lib",
    { "name": "secrets-vault", "version": "~2.1.0" }
  ],
  "userConfig": {
    "api_endpoint": {
      "type": "string",
      "title": "API endpoint",
      "description": "Your team's API endpoint"
    }
  },
  "channels": [
    {
      "server": "telegram",
      "userConfig": {
        "bot_token": {
          "type": "string",
          "title": "Bot token",
          "description": "Telegram bot token",
          "sensitive": true
        }
      }
    }
  ]
}
```

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `name` | `string` | Unique identifier (kebab-case, no spaces). Used for namespacing. | `"deployment-tools"` |

### Metadata Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `$schema` | `string` | JSON Schema URL for editor validation (ignored at load time) | `"https://json.schemastore.org/claude-code-plugin-manifest.json"` |
| `displayName` | `string` | Human-readable name shown in UI. Falls back to `name`. | `"Deployment Tools"` |
| `version` | `string` | Semantic version. Pins the plugin to that version. | `"2.1.0"` |
| `description` | `string` | Brief explanation of plugin purpose | `"Deployment automation tools"` |
| `author` | `object` | Author info with `name`, `email`, `url` | `{"name": "Dev Team"}` |
| `homepage` | `string` | Documentation URL | `"https://docs.example.com"` |
| `repository` | `string` | Source code URL | `"https://github.com/user/plugin"` |
| `license` | `string` | License identifier | `"MIT"`, `"Apache-2.0"` |
| `keywords` | `array` | Discovery tags | `["deployment", "ci-cd"]` |
| `defaultEnabled` | `boolean` | Whether plugin starts enabled. Default: `true`. Requires v2.1.154+. | `false` |

### Component Path Fields

| Field | Type | Description | Merge Behavior |
|-------|------|-------------|----------------|
| `skills` | `string \| array` | Custom skill directories (in addition to default `skills/`) | **Adds** to default |
| `commands` | `string \| array` | Custom flat `.md` skill files or directories | **Replaces** default |
| `agents` | `string \| array` | Custom agent files | **Replaces** default |
| `hooks` | `string \| array \| object` | Hook config paths or inline config | Own merge rules |
| `mcpServers` | `string \| array \| object` | MCP config paths or inline config | Own merge rules |
| `outputStyles` | `string \| array` | Custom output style files/directories | **Replaces** default |
| `lspServers` | `string \| array \| object` | LSP server configs | Own merge rules |
| `experimental.themes` | `string \| array` | Color theme files/directories | **Replaces** default |
| `experimental.monitors` | `string \| array` | Background monitor configs | **Replaces** default |

### Path Rules
- All paths must be relative to plugin root and start with `./`
- Multiple paths can be specified as arrays
- For "replaces default" fields, list the default explicitly to keep it: `"commands": ["./commands/", "./extras/"]`

### Unrecognized Fields
Claude Code ignores unrecognized top-level fields. This allows using the same manifest as a VS Code/Cursor extension or npm `package.json`. `claude plugin validate` reports unrecognized fields as warnings (not errors). Pass `--strict` to treat warnings as errors.

---

## 2. Hook Types Available

Hooks are event handlers that respond to Claude Code lifecycle events. Plugin hooks are defined in `hooks/hooks.json` (or inline in `plugin.json`).

### Lifecycle Events

| Event | When It Fires | Can Block? |
|-------|--------------|------------|
| `SessionStart` | When a session begins or resumes | No |
| `Setup` | When starting with `--init-only`, `--init` or `--maintenance` in `-p` mode | No |
| `UserPromptSubmit` | When you submit a prompt, before Claude processes it | No |
| `UserPromptExpansion` | When a user-typed command expands into a prompt | **Yes** |
| `PreToolUse` | Before a tool call executes | **Yes** |
| `PermissionRequest` | When a permission dialog appears | No |
| `PermissionDenied` | When a tool call is denied by auto mode classifier | No (can return `{retry: true}`) |
| `PostToolUse` | After a tool call succeeds | No |
| `PostToolUseFailure` | After a tool call fails | No |
| `PostToolBatch` | After a full batch of parallel tool calls resolves | No |
| `Notification` | When Claude Code sends a notification | No |
| `MessageDisplay` | While assistant message text is displayed | No |
| `SubagentStart` | When a subagent is spawned | No |
| `SubagentStop` | When a subagent finishes | No |
| `TaskCreated` | When a task is being created via `TaskCreate` | No |
| `TaskCompleted` | When a task is being marked as completed | No |
| `Stop` | When Claude finishes responding | No |
| `StopFailure` | When the turn ends due to an API error | No |
| `TeammateIdle` | When an agent team teammate is about to go idle | No |
| `InstructionsLoaded` | When a CLAUDE.md or `.claude/rules/*.md` file is loaded | No |
| `ConfigChange` | When a configuration file changes during a session | No |
| `CwdChanged` | When the working directory changes | No |
| `FileChanged` | When a watched file changes on disk | No |
| `WorktreeCreate` | When a worktree is being created | **Yes** (replaces default git behavior) |
| `WorktreeRemove` | When a worktree is being removed | No |
| `PreCompact` | Before context compaction | No |
| `PostCompact` | After context compaction completes | No |
| `Elicitation` | When an MCP server requests user input during a tool call | No |
| `ElicitationResult` | After a user responds to an MCP elicitation | No |
| `SessionEnd` | When a session terminates | No |

### Hook Handler Types

| Type | Description | Use Case |
|------|-------------|----------|
| `command` | Execute shell commands or scripts | Run scripts, lint, format |
| `http` | Send the event JSON as a POST request to a URL | External integrations |
| `mcp_tool` | Call a tool on a configured MCP server | MCP-based automation |
| `prompt` | Evaluate a prompt with an LLM (uses `$ARGUMENTS` placeholder) | LLM-based verification |
| `agent` | Run an agentic verifier with tools for complex verification | Complex multi-step checks |

### Hook Configuration Example

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}\"/scripts/format-code.sh"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "cd \"${CLAUDE_PLUGIN_DATA}\" && npm install"
          }
        ]
      }
    ]
  }
}
```

### Matcher Patterns

| Matcher Value | Evaluation | Example |
|---------------|------------|---------|
| `"*"`, `""`, or omitted | Match all | Fires on every occurrence |
| Only letters, digits, `_`, `\|` | Exact string or pipe-separated list | `Bash`, `Edit\|Write` |
| Contains other characters | JavaScript regular expression | `^Notebook`, `mcp__memory__.*` |

### Common Hook Handler Fields

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | Handler type: `command`, `http`, `mcp_tool`, `prompt`, `agent` |
| `if` | No | Additional condition (e.g., `Bash(rm *)`) |
| `async` | No | If `true`, runs in background without blocking |
| `asyncRewake` | No | If `true`, background + wakes Claude on exit code 2 |

### Command Hook Fields

| Field | Required | Description |
|-------|----------|-------------|
| `command` | Yes | Shell command or executable path |
| `args` | No | Argument list. When present, command is spawned directly (exec form) |
| `shell` | No | Shell to use: `"bash"` (default) or `"powershell"` |

---

## 3. Registration Mechanism

### How Plugins Are Discovered and Loaded

**1. Skills-Directory Plugins (Development)**
- Any folder under a skills directory containing `.claude-plugin/plugin.json` is loaded as `<name>@skills-dir`
- No marketplace or install step required
- Scaffold with: `claude plugin init <name>`

**Skills Directory Paths:**
| Directory | Scope | Loads |
|-----------|-------|-------|
| `~/.claude/skills/` | personal | In every project |
| `<cwd>/.claude/skills/` | project | Only after workspace trust dialog |

**2. Marketplace Installation**
- Plugins are copied to the user's local plugin cache (`~/.claude/plugins/cache/`)
- Each installed version is a separate directory
- Previous versions are marked orphaned and removed after 7 days

**Installation Scopes:**
| Scope | Settings File | Use Case |
|-------|--------------|----------|
| `user` | `~/.claude/settings.json` | Personal plugins across all projects (default) |
| `project` | `.claude/settings.json` | Team plugins shared via version control |
| `local` | `.claude/settings.local.json` | Project-specific, gitignored |
| `managed` | Managed settings | Read-only, admin-controlled |

**3. Auto-Discovery**
- Skills and commands are automatically discovered when the plugin is installed
- Agents appear in the `/agents` interface
- MCP servers start automatically when the plugin is enabled
- Hooks respond to lifecycle events automatically
- LSP servers provide real-time code intelligence

### Plugin Loading Process
1. Plugin is installed or discovered in skills directory
2. Manifest (`plugin.json`) is read if present; otherwise auto-discovery
3. Components are loaded from their configured/default locations
4. User configuration is prompted at enable time (if `userConfig` declared)
5. MCP servers and monitors start (if applicable)
6. Hooks register for their lifecycle events

---

## 4. Configuration Schema

### User Configuration (`userConfig`)

Declared in `plugin.json` to prompt users for configuration at enable time:

```json
{
  "userConfig": {
    "api_endpoint": {
      "type": "string",
      "title": "API endpoint",
      "description": "Your team's API endpoint"
    },
    "api_token": {
      "type": "string",
      "title": "API token",
      "description": "API authentication token",
      "sensitive": true
    }
  }
}
```

#### User Config Option Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `type` | Yes | `string` | One of: `string`, `number`, `boolean`, `directory`, `file` |
| `title` | Yes | `string` | Label shown in configuration dialog |
| `description` | Yes | `string` | Help text shown beneath the field |
| `sensitive` | No | `boolean` | If `true`, masks input and stores in secure storage |
| `required` | No | `boolean` | If `true`, validation fails when field is empty |
| `default` | No | any | Value used when user provides nothing |
| `multiple` | No | `boolean` | For `string` type, allow array of strings |
| `min` / `max` | No | `number` | Bounds for `number` type |

#### Storage
- Non-sensitive values: stored in `settings.json` under `pluginConfigs[<plugin-id>].options`
- Sensitive values: stored in system keychain (or `~/.claude/.credentials.json`)
- Environment variable: `CLAUDE_PLUGIN_OPTION_<KEY>` exported to plugin subprocesses
- Template substitution: `${user_config.KEY}` available in MCP/LSP configs, hook commands, monitor commands

### MCP Server Configuration

```json
{
  "mcpServers": {
    "plugin-database": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/db-server",
      "args": ["--config", "${CLAUDE_PLUGIN_ROOT}/config.json"],
      "env": {
        "DB_PATH": "${CLAUDE_PLUGIN_ROOT}/data"
      }
    }
  }
}
```

### LSP Server Configuration

```json
{
  "lspServers": {
    "go": {
      "command": "gopls",
      "args": ["serve"],
      "extensionToLanguage": {
        ".go": "go"
      }
    }
  }
}
```

#### LSP Fields

| Field | Required | Description |
|-------|----------|-------------|
| `command` | Yes | LSP binary to execute (must be in PATH) |
| `extensionToLanguage` | Yes | Maps file extensions to language identifiers |
| `args` | No | Command-line arguments |
| `transport` | No | `stdio` (default) or `socket` |
| `env` | No | Environment variables |
| `initializationOptions` | No | Options passed during initialization |
| `settings` | No | Settings via `workspace/didChangeConfiguration` |
| `workspaceFolder` | No | Workspace folder path |
| `startupTimeout` | No | Max startup wait time (ms) |
| `maxRestarts` | No | Max restart attempts |

### Monitor Configuration

```json
[
  {
    "name": "deploy-status",
    "command": "\"${CLAUDE_PLUGIN_ROOT}\"/scripts/poll-deploy.sh ${user_config.api_endpoint}",
    "description": "Deployment status changes"
  },
  {
    "name": "error-log",
    "command": "tail -F ./logs/error.log",
    "description": "Application error log",
    "when": "on-skill-invoke:debug"
  }
]
```

#### Monitor Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier within the plugin |
| `command` | Yes | Shell command run as background process |
| `description` | Yes | Short summary shown in task panel |
| `when` | No | `"always"` (default) or `"on-skill-invoke:<skill-name>"` |

### Theme Configuration

```json
{
  "name": "Dracula",
  "base": "dark",
  "overrides": {
    "claude": "#bd93f9",
    "error": "#ff5555",
    "success": "#50fa7b"
  }
}
```

---

## 5. File Structure

### Standard Plugin Layout

```
my-plugin/
├── .claude-plugin/           # Metadata directory (optional)
│   └── plugin.json             # Plugin manifest
├── skills/                   # Skills with <name>/SKILL.md structure
│   ├── code-reviewer/
│   │   └── SKILL.md
│   └── pdf-processor/
│       ├── SKILL.md
│       └── scripts/
├── commands/                 # Skills as flat .md files
│   ├── status.md
│   └── logs.md
├── agents/                   # Subagent definitions
│   ├── security-reviewer.md
│   └── performance-tester.md
├── output-styles/            # Output style definitions
│   └── terse.md
├── themes/                   # Color theme definitions
│   └── dracula.json
├── monitors/                 # Background monitor configs
│   └── monitors.json
├── hooks/                    # Hook configurations
│   ├── hooks.json
│   └── security-hooks.json
├── bin/                      # Plugin executables added to PATH
│   └── my-tool
├── settings.json             # Default settings for the plugin
├── .mcp.json                 # MCP server definitions
├── .lsp.json                 # LSP server configurations
├── scripts/                  # Hook and utility scripts
│   ├── security-scan.sh
│   └── format-code.py
├── LICENSE
└── CHANGELOG.md
```

### File Locations Reference

| Component | Default Location | Purpose |
|-----------|-----------------|---------|
| Manifest | `.claude-plugin/plugin.json` | Plugin metadata (optional) |
| Skills | `skills/` | Skills with `<name>/SKILL.md` structure |
| Commands | `commands/` | Flat Markdown skill files |
| Agents | `agents/` | Subagent Markdown files |
| Output styles | `output-styles/` | Output style definitions |
| Themes | `themes/` | Color theme definitions |
| Hooks | `hooks/hooks.json` | Hook configuration |
| MCP servers | `.mcp.json` | MCP server definitions |
| LSP servers | `.lsp.json` | Language server configurations |
| Monitors | `monitors/monitors.json` | Background monitor configurations |
| Executables | `bin/` | Executables added to Bash tool's PATH |
| Settings | `settings.json` | Default configuration (only `agent` and `subagentStatusLine` keys supported) |

### Special Rules
- The `.claude-plugin/` directory contains `plugin.json`. All other directories must be at the plugin root, NOT inside `.claude-plugin/`.
- A `CLAUDE.md` at the plugin root is NOT loaded as project context. Use skills instead.
- A `SKILL.md` at the plugin root with no `skills/` subdirectory auto-loads as a single-skill plugin (v2.1.142+).

---

## 6. Constraints & Limitations

### Security Constraints
- **Path traversal**: Installed plugins cannot reference files outside their directory. Paths like `../shared-utils` won't work after installation.
- **Plugin cache**: Marketplace plugins are copied to `~/.claude/plugins/cache/` rather than used in-place.
- **Symlinks**:
  - Within plugin directory: preserved as relative symlinks
  - Within same marketplace: dereferenced (target copied)
  - Outside marketplace: skipped for security
  - For `--plugin-dir` installs: only intra-plugin symlinks preserved

### Agent Constraints
- Plugin agents do NOT support: `hooks`, `mcpServers`, `permissionMode`
- Only valid `isolation` value for plugin agents: `"worktree"`
- Plugin agents support: `name`, `description`, `model`, `effort`, `maxTurns`, `tools`, `disallowedTools`, `skills`, `memory`, `background`, `isolation`

### Update Behavior
- When a plugin updates mid-session, hooks/monitors/MCP/LSP keep using the previous version's path
- Run `/reload-plugins` to switch hooks, MCP, and LSP to the new path
- Monitors require a session restart to use the new path

### Project-Scope @skills-dir Plugins
- Load only from `.claude/skills/` of the directory where Claude Code starts
- Do NOT walk up to repository root (unlike plain skills)
- MCP servers require per-server approval
- LSP servers start only after workspace trust
- Background monitors do NOT load

### Monitor Constraints
- Monitors require Claude Code v2.1.105+
- Run only in interactive CLI sessions
- Run unsandboxed at the same trust level as hooks
- Disabling a plugin mid-session does NOT stop already-running monitors

### Storage Limits
- Keychain storage (sensitive values) has approximately 2KB total limit
- Plugin data directory (`~/.claude/plugins/data/{id}/`) is deleted on uninstall unless `--keep-data`

### Validation
- `claude plugin validate ./my-plugin --strict` - strict mode treats warnings as errors
- Unrecognized fields are warnings by default (not errors)
- Fields with wrong types are load errors

---

## 7. Code Example: Minimal Plugin

### Minimal Single-Skill Plugin (no manifest needed)

```
my-skill/
└── SKILL.md
```

`SKILL.md`:
```markdown
---
name: my-skill
description: A minimal skill for Claude Code
---

# My Skill

Instructions for what this skill does and how Claude should use it.

## Usage

When the user asks about X, do Y.
```

### Minimal Plugin with Manifest

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json
└── skills/
    └── hello/
        └── SKILL.md
```

`plugin.json`:
```json
{
  "name": "my-plugin",
  "displayName": "My Plugin",
  "description": "A minimal example plugin",
  "version": "1.0.0",
  "author": {
    "name": "Developer",
    "email": "dev@example.com"
  },
  "license": "Apache-2.0"
}
```

`skills/hello/SKILL.md`:
```markdown
---
name: hello
description: Say hello to the user
---

# Hello Skill

When the user invokes /hello, greet them warmly and ask how you can help.
```

### Plugin with Hooks and MCP

```
enterprise-plugin/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── code-reviewer/
│       └── SKILL.md
├── hooks/
│   └── hooks.json
├── .mcp.json
└── scripts/
    └── post-edit-lint.sh
```

`plugin.json`:
```json
{
  "name": "enterprise-plugin",
  "displayName": "Enterprise Tools",
  "description": "Enterprise automation tools for Claude Code",
  "version": "1.2.0",
  "license": "Apache-2.0",
  "defaultEnabled": true,
  "author": {
    "name": "Enterprise Dev Team",
    "email": "dev@company.com"
  }
}
```

`hooks/hooks.json`:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}\"/scripts/post-edit-lint.sh"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "cd \"${CLAUDE_PLUGIN_DATA}\" && diff -q \"${CLAUDE_PLUGIN_ROOT}/package.json\" \"${CLAUDE_PLUGIN_DATA}/package.json\" >/dev/null 2>&1 || (cp \"${CLAUDE_PLUGIN_ROOT}/package.json\" . && npm install) || rm -f \"${CLAUDE_PLUGIN_DATA}/package.json\""
          }
        ]
      }
    ]
  }
}
```

`.mcp.json`:
```json
{
  "mcpServers": {
    "routines": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/server.js"],
      "env": {
        "NODE_PATH": "${CLAUDE_PLUGIN_DATA}/node_modules"
      }
    }
  }
}
```

### Plugin with User Configuration

```json
{
  "name": "api-integration",
  "displayName": "API Integration",
  "description": "Connects to external APIs",
  "version": "1.0.0",
  "userConfig": {
    "api_endpoint": {
      "type": "string",
      "title": "API Endpoint",
      "description": "Your API endpoint URL",
      "required": true
    },
    "api_key": {
      "type": "string",
      "title": "API Key",
      "description": "Your API authentication key",
      "sensitive": true,
      "required": true
    }
  },
  "mcpServers": {
    "api-client": {
      "command": "${CLAUDE_PLUGIN_ROOT}/bin/api-client",
      "env": {
        "API_ENDPOINT": "${user_config.api_endpoint}",
        "API_KEY": "${user_config.api_key}"
      }
    }
  }
}
```

---

## 8. CLI Commands Reference

### `claude plugin init <name> [options]`
Scaffold a new plugin at `~/.claude/skills/<name>/`.

| Option | Description | Default |
|--------|-------------|---------|
| `--description <text>` | Manifest description | - |
| `--author <name>` | Author name | `git config user.name` |
| `--author-email <email>` | Author email | `git config user.email` |
| `--with <components...>` | Scaffold components: `skills`, `agents`, `hooks`, `mcp`, `lsp`, `output-style`, `channel` | - |
| `-f, --force` | Overwrite existing `.claude-plugin/` | - |

**Example:**
```bash
claude plugin init my-helper --with skills hooks
```

### `claude plugin install <plugin> [options]`
Install a plugin from available marketplaces.

| Option | Description | Default |
|--------|-------------|---------|
| `-s, --scope <scope>` | Installation scope: `user`, `project`, `local` | `user` |

**Example:**
```bash
claude plugin install formatter@my-marketplace --scope project
```

### `claude plugin uninstall <plugin> [options]`
Remove an installed plugin.

| Option | Description | Default |
|--------|-------------|---------|
| `-s, --scope <scope>` | Uninstall from scope | `user` |
| `--keep-data` | Preserve the persistent data directory | - |
| `--prune` | Also remove auto-installed dependencies | - |
| `-y, --yes` | Skip confirmation prompt | - |

**Aliases:** `remove`, `rm`

### `claude plugin prune [options]`
Remove auto-installed dependencies no longer required.

| Option | Description | Default |
|--------|-------------|---------|
| `-s, --scope <scope>` | Prune at scope | `user` |
| `--dry-run` | List what would be removed without removing | - |
| `-y, --yes` | Skip confirmation | - |

**Aliases:** `autoremove`

### `claude plugin enable <plugin> [options]`
Enable a disabled plugin. Transitive dependency enabling.

| Option | Description | Default |
|--------|-------------|---------|
| `-s, --scope <scope>` | Scope to enable | `user` |

### `claude plugin disable <plugin> [options]`
Disable a plugin without uninstalling.

| Option | Description | Default |
|--------|-------------|---------|
| `-s, --scope <scope>` | Scope to disable | `user` |

### `claude plugin update <plugin> [options]`
Update a plugin to the latest version.

| Option | Description | Default |
|--------|-------------|---------|
| `-s, --scope <scope>` | Scope to update | `user` |

### `claude plugin list [options]`
List installed plugins with version, source, and enable status.

| Option | Description | Default |
|--------|-------------|---------|
| `--json` | Output as JSON | - |
| `--available` | Include available plugins from marketplaces (requires `--json`) | - |

### `claude plugin details <name>`
Show a plugin's component inventory and projected token cost.

### `claude plugin tag [options]`
Create a release git tag for the plugin in the current directory.

| Option | Description | Default |
|--------|-------------|---------|
| `--push` | Push the tag to remote | - |
| `--dry-run` | Print what would be tagged | - |
| `-f, --force` | Create even if working tree is dirty | - |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `${CLAUDE_PLUGIN_ROOT}` | Absolute path to plugin installation directory |
| `${CLAUDE_PLUGIN_DATA}` | Persistent directory for plugin state (`~/.claude/plugins/data/{id}/`) |
| `${CLAUDE_PROJECT_DIR}` | Project root directory |
| `CLAUDE_PLUGIN_OPTION_<KEY>` | User config values exported as env vars |

### Data Directory
- Resolves to `~/.claude/plugins/data/{id}/` where `{id}` is the plugin identifier with non-alphanumeric chars replaced by `-`
- Created automatically on first reference
- Deleted on uninstall unless `--keep-data`
- Outlives any single plugin version (safe for `node_modules`, caches)

---

## Dependencies

Plugins can declare dependencies on other plugins:

```json
{
  "dependencies": [
    "helper-lib",
    { "name": "secrets-vault", "version": "~2.1.0" }
  ]
}
```

- Dependencies are auto-installed when the requiring plugin is installed/enabled
- `claude plugin prune` removes orphaned dependencies
- Circular dependencies are not supported

---

## Experimental Components

Components under the `experimental` key have schemas that may change between releases:
- `experimental.themes` - Color themes
- `experimental.monitors` - Background monitors

Top-level `themes` and `monitors` still work but `claude plugin validate` warns; future releases will require `experimental.*`.

---

*Report compiled from the Claude Code Plugins Reference documentation at https://code.claude.com/docs/en/plugins-reference*
