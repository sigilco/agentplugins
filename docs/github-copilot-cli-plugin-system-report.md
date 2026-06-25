# GitHub Copilot CLI Plugin System - Technical Research Report

## Sources
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-creating
- https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference
- https://docs.github.com/en/copilot/reference/hooks-reference
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks
- https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-cli-plugins
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-finding-installing

---

## 1. Plugin Overview

A **plugin** is a distributable package that extends GitHub Copilot CLI functionality. It bundles one or more of these component types into a single installable unit:

| Component | Description | File(s) |
|-----------|-------------|---------|
| **Custom Agents** | Specialized AI assistants | `*.agent.md` files in `agents/` |
| **Skills** | Discrete callable capabilities | Skill subdirectories in `skills/`, each containing `SKILL.md` |
| **Hooks** | Event handlers intercepting agent behavior | `hooks.json` in plugin root or `hooks/hooks.json` |
| **MCP Server Configs** | Model Context Protocol integrations | `.mcp.json` in plugin root or `.github/mcp.json` |
| **LSP Server Configs** | Language Server Protocol integrations | `lsp.json` in plugin root or `.github/lsp.json` |
| **Commands** | Custom command directories | Specified via `commands` field in manifest |

---

## 2. Plugin Manifest Format (`plugin.json`)

### 2.1 Required Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | **Yes** | Kebab-case plugin name. **Max 64 characters**. |

### 2.2 Optional Metadata Fields

| Field | Type | Description |
|-------|------|-------------|
| `description` | `string` | Plugin description. **Max 1024 characters**. |
| `version` | `string` | Semantic version (e.g., `"1.2.0"`). |
| `author` | `object` | `{ name: string, email?: string, url?: string }` |
| `license` | `string` | License identifier (e.g., `"MIT"`). |
| `keywords` | `string[]` | Search keywords for marketplace discovery. |
| `homepage` | `string` | Plugin homepage URL. |
| `repository` | `string` | Source repository URL. |
| `category` | `string` | Plugin category. |
| `tags` | `string[]` | Additional tags. |

### 2.3 Component Path Fields

These tell the CLI where to find plugin components. All are optional; the CLI uses default conventions if omitted.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `agents` | `string \| string[]` | `agents/` | Path(s) to agent directories (`*.agent.md` files). |
| `skills` | `string \| string[]` | `skills/` | Path(s) to skill directories. |
| `commands` | `string \| string[]` | — | Path(s) to command directories. |
| `hooks` | `string \| object` | — | Path to a hooks config file, or an inline hooks object. |
| `mcpServers` | `string \| object` | — | Path to an MCP config file, or inline server definitions. |
| `lspServers` | `string \| object` | — | Path to an LSP config file, or inline server definitions. |

### 2.4 Validation Control

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `strict` | `boolean` | `true` | When `true`, plugin must conform to full schema/validation. When `false`, relaxed validation (useful for direct installs or legacy plugins). |

### 2.5 Complete Manifest Example

```json
{
  "name": "my-dev-tools",
  "description": "React development utilities",
  "version": "1.2.0",
  "author": {
    "name": "Jane Doe",
    "email": "jane@example.com"
  },
  "license": "Apache-2.0",
  "keywords": ["react", "frontend"],
  "agents": "agents/",
  "skills": ["skills/", "extra-skills/"],
  "hooks": "hooks.json",
  "mcpServers": ".mcp.json"
}
```

### 2.6 Manifest Discovery Locations (checked in order)

The CLI searches for `plugin.json` in these locations:
1. `.plugin/plugin.json`
2. `plugin.json` (root)
3. `.github/plugin/plugin.json`
4. `.claude-plugin/plugin.json`

---

## 3. File Structure

### 3.1 Minimal Plugin

```
my-plugin/
└── plugin.json           # Required manifest (only file needed)
```

### 3.2 Full Plugin Structure

```
my-plugin/
├── plugin.json           # Required manifest
├── agents/               # Custom agents (optional)
│   └── helper.agent.md
├── skills/               # Skills (optional)
│   └── deploy/
│       └── SKILL.md
├── hooks.json            # Hook configuration (optional)
└── .mcp.json             # MCP server config (optional)
```

### 3.3 File Locations Summary

| Item | Path |
|------|------|
| **Plugin manifest** | `.plugin/plugin.json`, `plugin.json`, `.github/plugin/plugin.json`, `.claude-plugin/plugin.json` |
| **Agents** | `agents/` (default, overridable in manifest) |
| **Skills** | `skills/` (default, overridable in manifest) |
| **Hooks config** | `hooks.json` or `hooks/hooks.json` |
| **MCP config** | `.mcp.json`, `.github/mcp.json` |
| **LSP config** | `lsp.json`, `.github/lsp.json` |
| **Installed plugins** | `~/.copilot/installed-plugins/MARKETPLACE/PLUGIN-NAME` (via marketplace) or `~/.copilot/installed-plugins/_direct/SOURCE-ID/` (direct install) |
| **Plugin data dir** | `${COPILOT_PLUGIN_DATA}` (also `${CLAUDE_PLUGIN_DATA}`) - persistent writable directory unique to each installed plugin |
| **Marketplace cache** | `~/.cache/copilot/marketplaces/` (Linux), `~/Library/Caches/copilot/marketplaces/` (macOS). Override via `COPILOT_CACHE_HOME` |

---

## 4. Hook Types (Lifecycle Events)

Hooks are external commands that execute at specific lifecycle points during a session.

### 4.1 Hook Configuration Format

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [...],
    "sessionEnd": [...],
    "userPromptSubmitted": [...],
    "preToolUse": [...],
    "postToolUse": [...],
    "postToolUseFailure": [...],
    "agentStop": [...],
    "subagentStart": [...],
    "subagentStop": [...],
    "errorOccurred": [...],
    "preCompact": [...],
    "permissionRequest": [...],
    "notification": [...]
  }
}
```

### 4.2 Hook Entry Types

**Command hooks** (supported on all event types):
```json
{
  "type": "command",
  "bash": "your-bash-command",
  "powershell": "your-powershell-command",
  "command": "cross-platform-fallback",
  "cwd": "optional/working/directory",
  "env": { "VAR": "value" },
  "timeoutSec": 30
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"command"` | No | Defaults to `"command"` when omitted. |
| `bash` | `string` | One of `bash`, `powershell`, `command` | Shell command for Unix. |
| `powershell` | `string` | One of `bash`, `powershell`, `command` | Shell command for Windows. |
| `command` | `string` | One of `bash`, `powershell`, `command` | Cross-platform fallback (copied to both). |
| `cwd` | `string` | No | Working directory (relative to repo root or absolute). |
| `env` | `object` | No | Environment variables (supports variable expansion). |
| `timeoutSec` | `number` | No | Timeout in seconds. **Default: 30**. |
| `timeout` | `number` | No | Alias for `timeoutSec` (used only when `timeoutSec` absent). |

**HTTP hooks**:
```json
{
  "type": "http",
  "url": "https://example.com/hook",
  "timeoutSec": 30
}
```
> Note: Only `https://` URLs allowed by default. Non-TLS `http://` rejected except for `http://localhost`, `http://127.*`, `http://[::1]` when `COPILOT_HOOK_ALLOW_LOCALHOST=1`.

**Prompt hooks** (CLI only, `sessionStart` only):
```json
{
  "type": "prompt",
  "prompt": "Your prompt text or /slash-command"
}
```

### 4.3 Complete Hook Events Table

| Event | Fires When | Output Processed | Can Block? |
|-------|------------|-----------------|------------|
| `sessionStart` | New or resumed session begins | Optional - injects `additionalContext` | No |
| `sessionEnd` | Session terminates | No | No |
| `userPromptSubmitted` | User submits a prompt | No | No |
| `preToolUse` | Before each tool executes | Yes - can `allow`, `deny`, or modify | **Yes** |
| `postToolUse` | After tool completes successfully | Yes - can modify result | No |
| `postToolUseFailure` | After tool completes with failure | Yes - can provide recovery guidance | No |
| `agentStop` | Main agent finishes a turn | Yes - can block and force continuation | Yes |
| `subagentStart` | Subagent spawned (before it runs) | Optional - injects context | No |
| `subagentStop` | Subagent completes | Yes - can block and force continuation | Yes |
| `errorOccurred` | Error during execution | No | No |
| `preCompact` | Context compaction about to begin | No (notification only) | No |
| `permissionRequest` | Before permission service runs | Yes - can `allow` or `deny` | Yes |
| `notification` | CLI emits system notification | No (fire-and-forget) | No |

### 4.4 Matcher Filtering

Some hooks support a `matcher` field for conditional execution:

| Event | `matcher` matched against |
|-------|---------------------------|
| `preCompact` | `trigger` (`"manual"` or `"auto"`) |
| `preToolUse` | `toolName` |
| `subagentStart` | `agentName` |

Matcher is a regex anchored as `^(?:pattern)$`; must match the full value.

### 4.5 Decision Control Outputs

**`preToolUse` decision** (stdout JSON):
```json
{
  "permission": "allow" | "deny" | "ask",
  "modifiedResult": {
    "resultType": "success",
    "textResultForLlm": "replacement text"
  },
  "additionalContext": "guidance appended to tool output"
}
```

**`permissionRequest` decision** (stdout JSON):
```json
{
  "behavior": "allow" | "deny",
  "message": "reason for denial",
  "interrupt": true
}
```

**`agentStop` / `subagentStop` decision** (stdout JSON):
```json
{
  "decision": "allow" | "block",
  "additionalContext": "context injected if blocked"
}
```
- `"block"` forces another turn.

**`postToolUse` output** (stdout JSON):
```json
{
  "modifiedResult": {
    "resultType": "success",
    "textResultForLlm": "replacement text"
  },
  "additionalContext": "text appended to tool output"
}
```

### 4.6 Exit Codes for Command Hooks

| Exit Code | Meaning |
|-----------|---------|
| `0` | Success. stdout parsed as hook output JSON. |
| `2` | Warning. stderr surfaced but continues. For `permissionRequest`: treated as `{"behavior":"deny"}`. For `postToolUseFailure`: treated as `additionalContext`. |
| Other non-zero | Hook failure, logged and skipped (fail-open). **Exception**: `preToolUse` is **fail-closed** - non-zero exit denies the tool call. |
| Timeout | Killed after `timeoutSec`. Error logged. **Exception**: `preToolUse` timeout denies the tool call. |

### 4.7 Input Payload Formats

Two formats supported, selected by event name casing:

**camelCase** (e.g., `sessionStart`): Fields use camelCase.
**VS Code compatible** (e.g., `SessionStart`): Fields use snake_case.

Example: `sessionStart` / `SessionStart`
```json
// camelCase
{
  "sessionId": "string",
  "timestamp": 1234567890,
  "cwd": "/path/to/repo",
  "source": "startup" | "resume" | "new",
  "initialPrompt": "optional prompt text"
}

// VS Code compatible
{
  "hook_event_name": "SessionStart",
  "session_id": "string",
  "timestamp": "ISO-8601-string",
  "cwd": "/path/to/repo",
  "source": "startup" | "resume" | "new",
  "initial_prompt": "optional prompt text"
}
```

### 4.8 Tool Names for `preToolUse` Matcher

| Tool Name | Description |
|-----------|-------------|
| `ask_user` | Ask user a clarifying question |
| `bash` | Execute shell commands (Unix) |
| `create` | Create new files |
| `edit` | Modify file contents |
| `glob` | Find files by pattern |
| `grep` | Search file contents |
| `powershell` | Execute shell commands (Windows) |
| `task` | Run subagent tasks |
| `view` | Read file contents |
| `web_fetch` | Fetch web pages |

---

## 5. Registration & Loading Mechanism

### 5.1 Plugin Installation

Plugins can be installed from multiple sources:

| Source | Specification Format | Example |
|--------|---------------------|---------|
| **Marketplace** | `plugin@marketplace` | `my-plugin@awesome-copilot` |
| **GitHub repo root** | `OWNER/REPO` | `github/copilot-dev-tools` |
| **GitHub subdir** | `OWNER/REPO:PATH/TO/PLUGIN` | `github/tools:plugins/deploy` |
| **Git URL** | `https://github.com/o/r.git` | Any git URL |
| **Local path** | `./my-plugin` or `/abs/path` | Local directory |

### 5.2 CLI Commands

| Command | Description |
|---------|-------------|
| `copilot plugin install SPECIFICATION` | Install a plugin |
| `copilot plugin uninstall NAME` | Remove a plugin (uses `name` from manifest, not path) |
| `copilot plugin list` | List installed plugins |
| `copilot plugin update NAME` | Update a named plugin (`--all` for all) |
| `copilot plugin enable NAME` | Enable a previously disabled plugin |
| `copilot plugin disable NAME` | Disable a plugin without uninstalling |
| `copilot plugin marketplace add SPECIFICATION` | Register a marketplace |
| `copilot plugin marketplace list` | List registered marketplaces |
| `copilot plugin marketplace browse NAME` | Browse marketplace plugins |
| `copilot plugin marketplace remove NAME` | Unregister a marketplace |

### 5.3 Default Marketplaces

Two marketplaces come pre-registered:
- `copilot-plugins`
- `awesome-copilot`

### 5.4 Loading Order and Precedence

**Agents and skills** use **first-found-wins** precedence:
1. `~/.copilot/agents/` (user-level)
2. `<project>/.github/agents/` (project-level)
3. `<parents>/.github/agents/` (inherited, monorepo)
4. `<project>/.claude/agents/` (project-level alt)
5. `<parents>/.claude/agents/` (inherited alt)
6. **Plugin `agents/` dirs** (plugin, by install order)
7. Remote org/enterprise agents (via API)

> Plugin agents are silently ignored if a project-level or personal config has the same agent ID.

**MCP servers** use **last-wins** precedence:
1. `~/.copilot/mcp-config.json` (lowest priority)
2. **Plugin MCP configs** (plugins)
3. `--additional-mcp-config` flag (highest priority)

**Built-in tools and agents** are always present and cannot be overridden.

### 5.5 Caching Behavior

- When a plugin is installed, its components are **cached**.
- The CLI reads from the cache for subsequent sessions.
- To pick up changes made to a **local plugin**, reinstall it: `copilot plugin install ./my-plugin`

---

## 6. Skill Format (`SKILL.md`)

Skills are folders containing instructions, scripts, and resources.

### 6.1 Structure
```
skills/
└── my-skill/              # Skill directory (lowercase, hyphenated)
    ├── SKILL.md           # Required skill definition file
    └── ...                # Optional supplementary files
```

### 6.2 SKILL.md Format

SKILL.md files are **Markdown with YAML frontmatter**:

```markdown
---
name: my-skill           # Required: lowercase, hyphenated unique ID
description: What this skill does and when Copilot should use it
license: Apache-2.0             # Optional
---

# Instructions

Write your skill instructions, examples, and guidelines here.
This is the content that Copilot will follow when the skill is activated.
```

### 6.3 Agent Format (`*.agent.md`)

```markdown
---
name: my-agent
description: Helps with specific tasks
tools: ["bash", "edit", "view"]
---

You are a specialized assistant that...
```

---

## 7. Configuration Schema

### 7.1 Hooks Configuration (`hooks.json`)

```json
{
  "version": 1,
  "disableAllHooks": false,
  "hooks": {
    "sessionStart": [
      {
        "type": "command",
        "bash": "echo 'session started' >> ~/.copilot/sessions.log",
        "powershell": "Write-Output 'session started' | Add-Content ~/.copilot/sessions.log",
        "timeoutSec": 30
      }
    ],
    "preToolUse": [
      {
        "type": "command",
        "bash": "./scripts/check-tool.sh",
        "matcher": "bash|edit",
        "timeoutSec": 10
      }
    ],
    "postToolUse": [
      {
        "type": "http",
        "url": "https://example.com/log-tool-use",
        "timeoutSec": 5
      }
    ]
  }
}
```

### 7.2 MCP Configuration (`.mcp.json`)

Standard MCP server configuration file. Plugins can bundle MCP server definitions that get loaded with the plugin.

### 7.3 LSP Configuration (`lsp.json`)

Language Server Protocol server configuration file.

---

## 8. Constraints & Limitations

### 8.1 Plugin-Level Constraints

| Constraint | Detail |
|------------|--------|
| **Name length** | Max 64 characters, kebab-case |
| **Description length** | Max 1024 characters |
| **Minimum file** | Only `plugin.json` is required |
| **Validation** | `strict: true` by default (full schema validation); set `strict: false` for relaxed validation |
| **Caching** | Components are cached on install; local changes require reinstallation |

### 8.2 Precedence Constraints

- Plugin **agents** and **skills** are **silently ignored** if a project-level or personal config has the same name/ID
- Plugins **cannot override** project-level or personal configurations
- Plugin **MCP servers** can override previously installed MCP servers (last-wins)

### 8.3 Hook Constraints

| Constraint | Detail |
|------------|--------|
| `preToolUse` is **fail-closed** | Crashes, non-zero exits (other than 2), and timeouts **deny** the tool call |
| `permissionRequest` | Does not apply to **read** and **hook** permission kinds (short-circuited before hooks) |
| `notification` hook | **CLI only**, does not fire in cloud agent |
| `prompt` hooks | **CLI only**, fire only for new interactive sessions (not resume, not `-p` mode) |
| HTTP hooks | Only `https://` by default; `http://` only for localhost with opt-in |
| Hook timeout | Default 30 seconds |
| Additional context cap | 10 KB when multiple hooks return `additionalContext` |

### 8.4 Cloud Agent Limitations

- Hooks run in ephemeral Linux sandbox (non-interactive, constrained network, destroyed on job end)
- Only a subset of events fires
- Only `bash` (or `command`) entries honored; `powershell` ignored
- `ask_user` tool does not produce useful results (no user)
- `permissionRequest` either doesn't fire or has no effect (tool calls pre-approved)
- `notification` hook does not fire
- `prompt` hooks may not fire (non-interactive)

---

## 9. Minimal Plugin Example

### 9.1 Absolute Minimum Plugin

```
my-minimal-plugin/
└── plugin.json
```

```json
{
  "name": "my-minimal-plugin",
  "description": "The smallest possible Copilot CLI plugin",
  "version": "1.0.0"
}
```

Install: `copilot plugin install ./my-minimal-plugin`

### 9.2 Plugin with Hooks

```
my-security-plugin/
├── plugin.json
└── hooks.json
```

**plugin.json:**
```json
{
  "name": "security-guard",
  "description": "Security controls for tool execution",
  "version": "1.0.0",
  "author": { "name": "Security Team" },
  "hooks": "hooks.json"
}
```

**hooks.json:**
```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      {
        "type": "command",
        "bash": "echo '{\"permission\":\"allow\"}'",
        "timeoutSec": 10
      }
    ],
    "sessionStart": [
      {
        "type": "command",
        "bash": "echo \"Session started at $(date)\" >> ~/.copilot/session.log",
        "timeoutSec": 5
      }
    ]
  }
}
```

### 9.3 Plugin with Agent

```
my-dev-plugin/
├── plugin.json
└── agents/
    └── code-reviewer.agent.md
```

**plugin.json:**
```json
{
  "name": "code-review-agent",
  "description": "Provides a code review agent",
  "version": "1.0.0",
  "agents": "agents/"
}
```

**agents/code-reviewer.agent.md:**
```markdown
---
name: code-reviewer
description: Reviews code changes for quality and best practices
tools: ["view", "bash", "edit"]
---

You are an expert code reviewer. Focus on:
- Code correctness and edge cases
- Performance implications
- Security vulnerabilities
- Testing coverage
- Maintainability and readability

Always provide specific, actionable feedback with code examples.
```

### 9.4 Plugin with Skill

```
my-deploy-plugin/
├── plugin.json
└── skills/
    └── deploy/
        └── SKILL.md
```

**plugin.json:**
```json
{
  "name": "deploy-skill",
  "description": "Deployment automation skill",
  "version": "1.0.0",
  "skills": "skills/"
}
```

**skills/deploy/SKILL.md:**
```markdown
---
name: deploy
description: Deploy the current project to production
---

# Deployment Skill

When asked to deploy, follow these steps:
1. Check the current git status and branch
2. Run tests to verify everything passes
3. Build the project if needed
4. Execute the deployment script
5. Verify the deployment succeeded

Always confirm with the user before deploying to production.
```

---

## 10. Marketplace Format (`marketplace.json`)

For distributing plugins, create a `marketplace.json` in `.github/plugin/`:

```json
{
  "name": "my-marketplace",
  "owner": {
    "name": "Your Organization",
    "email": "plugins@example.com"
  },
  "metadata": {
    "description": "Curated plugins for our team",
    "version": "1.0.0"
  },
  "plugins": [
    {
      "name": "frontend-design",
      "description": "Create a professional-looking GUI",
      "version": "2.1.0",
      "source": "./plugins/frontend-design"
    },
    {
      "name": "security-checks",
      "description": "Check for potential security vulnerabilities",
      "version": "1.3.0",
      "source": "./plugins/security-checks"
    }
  ]
}
```

Register: `copilot plugin marketplace add OWNER/REPO`

---

## 11. Environment Variables

| Variable | Purpose |
|----------|---------|
| `COPILOT_HOME` | Base directory for Copilot config (hooks: `$COPILOT_HOME/hooks/`) |
| `COPILOT_CACHE_HOME` | Override marketplace cache directory |
| `COPILOT_PLUGIN_DATA` | Persistent writable directory per installed plugin |
| `CLAUDE_PLUGIN_DATA` | Alias for `COPILOT_PLUGIN_DATA` |
| `COPILOT_HOOK_ALLOW_LOCALHOST` | Set to `1` to allow `http://localhost` hooks |
| `COPILOT_SKILLS_DIRS` | Additional skill directories |

---

*Report compiled from official GitHub documentation as of July 2025.*
