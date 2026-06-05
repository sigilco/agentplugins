# Google Gemini CLI Extension/Plugin System - Technical Research Report

## Executive Summary

Google Gemini CLI has a **formal, well-documented extension system** that allows developers to package and distribute customizations including MCP servers, custom slash commands, context files (GEMINI.md), agent skills, hooks, themes, sub-agents, and policy rules. Extensions are distributed as GitHub repositories or local directories and are installed via `gemini extensions install <source>`.

**Key Sources:**
- [Gemini CLI Extensions Documentation](https://geminicli.com/docs/extensions/)
- [Extension Reference](https://geminicli.com/docs/extensions/reference/)
- [Hooks Reference](https://geminicli.com/docs/hooks/reference/)
- [Policy Engine Documentation](https://geminicli.com/docs/reference/policy-engine/)
- [Ralph Extension (Real-world example)](https://github.com/gemini-cli-extensions/ralph)
- [Workspace Extension (Real-world example)](https://github.com/gemini-cli-extensions/workspace)

---

## 1. Plugin Manifest Format (`gemini-extension.json`)

### Required Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Unique extension identifier. Lowercase, numbers, dashes only. Must match directory name. |
| `version` | `string` | Yes | SemVer version (e.g., `"1.0.0"`). |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `description` | `string` | Short description shown in the extension gallery. |
| `migratedTo` | `string` | URL of new repository. CLI auto-checks for migration. |
| `mcpServers` | `object` | Map of MCP server configurations (key = server name, value = server config). |
| `contextFileName` | `string` | Name of context file (defaults to `GEMINI.md` if present). |
| `excludeTools` | `string[]` | Array of tool names to exclude. Supports command-specific syntax like `run_shell_command(rm -rf)`. |
| `plan` | `object` | Planning configuration with `directory` for plan artifacts. |
| `settings` | `array` | User-configurable settings (API keys, URLs, etc.). |
| `themes` | `array` | Custom UI themes array. |

### Full Schema Example

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "description": "My awesome extension",
  "migratedTo": "https://github.com/new-owner/new-extension-repo",
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["${extensionPath}/my-server.js"],
      "cwd": "${extensionPath}"
    }
  },
  "contextFileName": "GEMINI.md",
  "excludeTools": ["run_shell_command", "run_shell_command(rm -rf)"],
  "plan": {
    "directory": ".gemini/plans"
  },
  "settings": [
    {
      "name": "API Key",
      "description": "Your API key for the service.",
      "envVar": "MY_API_KEY",
      "sensitive": true
    }
  ],
  "themes": [
    {
      "name": "shades-of-green",
      "type": "custom",
      "background": { "primary": "#1a362a" },
      "text": { "primary": "#a6e3a1", "secondary": "#6e8e7a", "link": "#89e689" },
      "status": { "success": "#76c076", "warning": "#d9e689", "error": "#b34e4e" },
      "border": { "default": "#4a6c5a" },
      "ui": { "comment": "#6e8e7a" }
    }
  ]
}
```

### MCP Server Configuration (inside `mcpServers`)

All standard MCP server config options are supported **except** `trust`:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@scope/package"],
      "cwd": "${extensionPath}",
      "env": { "KEY": "value" }
    }
  }
}
```

**Variable substitution available:**
- `${extensionPath}` - Absolute path to extension directory
- `${workspacePath}` - Absolute path to current workspace
- `${/}` - Platform-specific path separator

---

## 2. Hook Types Available

Hooks are defined in `hooks/hooks.json` within the extension directory (NOT in `gemini-extension.json`).

### Lifecycle Events (10 types)

| Event | When It Fires | Impact | Can Block? |
|-------|--------------|--------|------------|
| `SessionStart` | Session begins (startup, resume, /clear) | Injects context | No (advisory) |
| `SessionEnd` | Session ends (exit, clear, logout) | Advisory cleanup | No (best effort) |
| `BeforeAgent` | After user prompt, before planning | Block turn / inject context | Yes |
| `AfterAgent` | After agent generates final response | Retry / halt | Yes (deny = retry) |
| `BeforeModel` | Before sending request to LLM | Block turn / mock response | Yes |
| `AfterModel` | After receiving LLM response chunk | Block / redact response | Yes |
| `BeforeToolSelection` | Before LLM selects tools | Filter available tools | Limited |
| `BeforeTool` | Before a tool executes | Block tool / rewrite args | Yes |
| `AfterTool` | After a tool executes | Hide result / inject context | Yes (deny = hide result) |
| `PreCompress` | Before context compression | Advisory (save state) | No |
| `Notification` | System alert (e.g., Tool Permission) | Advisory logging | No |

### Hook Definition Schema (`hooks/hooks.json`)

```json
{
  "hooks": {
    "AfterAgent": [
      {
        "matcher": "*",
        "sequential": false,
        "hooks": [
          {
            "name": "hook-name",
            "type": "command",
            "command": "${extensionPath}/hooks/stop-hook.sh",
            "description": "What this hook does"
          }
        ]
      }
    ]
  }
}
```

### Hook Definition Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `matcher` | `string` | No | Regex for tool hooks, exact string for lifecycle hooks. `"*"` matches all. |
| `sequential` | `boolean` | No | If `true`, hooks run sequentially. If `false`, parallel. |
| `hooks` | `array` | Yes | Array of hook configurations. |

### Hook Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | Yes | Execution engine. Currently only `"command"`. |
| `command` | `string` | Yes* | Shell command to execute. |
| `name` | `string` | No | Human-readable hook name. |
| `description` | `string` | No | Description shown in UI. |

### Hook I/O Mechanics

- **Input**: JSON via `stdin`
- **Output**: JSON via `stdout`
- **Logs**: `stderr`
- **Exit codes**:
  - `0`: Success - stdout parsed as JSON
  - `2`: System Block - stderr used as rejection reason
  - Other: Warning - non-fatal, continues with warning

### Common Output Fields (All Hooks)

```json
{
  "decision": "allow" | "deny",
  "reason": "Required if denied",
  "systemMessage": "Message shown to user",
  "continue": true | false,
  "hookSpecificOutput": { ... }
}
```

### Event-Specific Hook Outputs

| Event | `hookSpecificOutput` Fields | Description |
|-------|---------------------------|-------------|
| `BeforeTool` | `tool_input` | Overrides tool arguments before execution |
| `AfterTool` | `additionalContext`, `tailToolCallRequest` | Appends to result or triggers follow-up tool |
| `BeforeAgent` | `additionalContext` | Appended to user prompt for this turn |
| `AfterAgent` | `clearContext` | If `true`, clears conversation history |
| `BeforeModel` | `llm_request`, `llm_response` | Overrides request or provides synthetic response |
| `AfterModel` | `llm_response` | Replaces model's response chunk |
| `BeforeToolSelection` | `toolConfig.mode`, `toolConfig.allowedFunctionNames` | Filters available tools |
| `SessionStart` | `additionalContext` | Injected as first turn in history |

### Input Schemas

**Stable Model API (BeforeModel, AfterModel, BeforeToolSelection):**
```typescript
interface LLMRequest {
  model: string;
  messages: Array<{
    role: "user" | "model" | "system";
    content: string;  // Non-text parts filtered out
  }>;
  config: { temperature: number; ... };
  toolConfig: { mode: string; allowedFunctionNames: string[] };
}

interface LLMResponse {
  candidates: Array<{
    content: { role: "model"; parts: string[] };
    finishReason: string;
  }>;
  usageMetadata: { totalTokenCount: number };
}
```

**Tool Hooks (BeforeTool, AfterTool):**
```typescript
interface ToolHookInput {
  tool_name: string;
  tool_input: object;        // Arguments
  tool_response?: object;    // Result (AfterTool only)
  mcp_context?: object;      // MCP metadata
  original_request_name?: string;  // For tail tool calls
}
```

---

## 3. Registration Mechanism

### Installation

Extensions are installed from GitHub repos or local paths:

```bash
# Install from GitHub
gemini extensions install https://github.com/owner/repo

# With options
gemini extensions install <source> \
  [--ref <branch|tag|commit>] \
  [--auto-update] \
  [--pre-release] \
  [--consent] \
  [--skip-settings]
```

### Loading Location

Extensions are loaded from:
- **Global**: `<home>/.gemini/extensions/<extension-name>/`
- **Workspace**: `<workspace>/.gemini/extensions/<extension-name>/`

### Linking (Development)

```bash
# Create symlink for live development
gemini extensions link <path>
```

### Registration Priority (Config Merging)

When Gemini CLI starts, it loads all extensions and merges configurations:

```
Workspace configuration > User configuration > Extension defaults
```

### Extension Hook Registration

Extension hooks are registered with `ConfigSource.Extensions` priority, integrating alongside user and project hooks.

### Discovery Flow

1. CLI scans `~/.gemini/extensions/` and `<workspace>/.gemini/extensions/`
2. Each subdirectory must contain `gemini-extension.json`
3. Configurations are merged (workspace takes precedence on conflicts)
4. MCP servers are loaded on startup
5. Hooks are registered from `hooks/hooks.json`
6. Custom commands discovered from `commands/*.toml`
7. Skills discovered from `skills/<skill-name>/SKILL.md`
8. Policies loaded from `policies/*.toml`

### Management Commands

```bash
gemini extensions list                    # List installed extensions
gemini extensions uninstall <name>        # Remove extension
gemini extensions disable <name>          # Disable extension
gemini extensions enable <name>           # Re-enable extension
gemini extensions update <name>           # Update to specified version
gemini extensions update --all            # Update all extensions
gemini extensions config <name>           # Configure extension settings
gemini extensions new <path> [template]   # Create from template
gemini extensions link <path>             # Symlink for development
```

---

## 4. Configuration Schema

### Extension Settings (`settings` array in manifest)

```json
{
  "settings": [
    {
      "name": "API Key",
      "description": "Your API key for the service.",
      "envVar": "MY_API_KEY",
      "sensitive": true
    },
    {
      "name": "API URL",
      "description": "Custom API endpoint URL.",
      "envVar": "MY_API_URL",
      "sensitive": false
    }
  ]
}
```

### Setting Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Display name in UI |
| `description` | `string` | Yes | Explanation of the setting |
| `envVar` | `string` | Yes | Environment variable name for storage |
| `sensitive` | `boolean` | No | If `true`, stored in system keychain and UI-obfuscated |

### Storage

- Values stored in `.env` file within extension directory
- Sensitive values use system keychain
- Only declared env vars are passed to extension/MCP (see Environment Sanitization)

### Environment Variable Sanitization

**Critical security constraint:** Extensions do NOT inherit the user's full shell environment. Only:

1. Standard safe variables: `HOME`, `PATH`, `TMPDIR`
2. Variables explicitly declared in `settings` array via `envVar`

**All other environment variables are filtered out.**

---

## 5. File Structure Expected

### Minimal Extension (Context Only)
```
my-extension/
├── gemini-extension.json          # Manifest (required)
└── GEMINI.md                      # Context file (optional but recommended)
```

### MCP Server Extension
```
my-extension/
├── gemini-extension.json          # Manifest with mcpServers
├── example.js                     # MCP server implementation
└── package.json
```

### Full Extension (All Features)
```
my-extension/
├── gemini-extension.json          # Manifest (required)
├── GEMINI.md                      # Context file
├── commands/                      # Custom slash commands
│   ├── deploy.toml                # → /deploy
│   └── gcs/
│       └── sync.toml              # → /gcs:sync (namespaced)
├── hooks/                         # Lifecycle hooks
│   ├── hooks.json                 # Hook definitions
│   └── stop-hook.sh               # Hook scripts
├── skills/                        # Agent skills
│   ├── security-audit/
│   │   ├── SKILL.md               # Skill definition (YAML frontmatter + markdown)
│   │   ├── scripts/
│   │   │   └── scan.sh
│   │   └── references/
│   │       └── checklist.md
│   └── code-review/
│       └── SKILL.md
├── agents/                        # Sub-agents (preview feature)
│   └── specialist.md
├── policies/                      # Policy engine rules
│   └── safety.toml
├── scripts/                       # Helper scripts
│   └── setup.sh
├── themes/                        # Not a directory; themes defined in gemini-extension.json
└── .gitignore
```

### Command TOML File Format

```toml
# commands/deploy.toml
description = "Deploy the current project to production."
prompt = """
Deploy the current project using the appropriate deployment method.
Review the deployment checklist first:
1. Run all tests
2. Check environment variables
3. Execute deployment script
"""
```

### Skill Format (`SKILL.md`)

```markdown
---
name: code-reviewer
description: >
  Expertise in reviewing code changes for correctness, security, and style.
  Use when the user asks to "review" their code or a PR.
---

# Code Reviewer Instructions

You act as a senior software engineer specialized in code quality.

1. **Analyze**: Review the provided code for logical errors, security vulnerabilities, and style violations.
2. **Review**: Use the bundled `scripts/review.js` utility to perform an automated check.
3. **Feedback**: Provide constructive feedback, clearly distinguishing between critical issues and minor improvements.
```

### Policy TOML Format

```toml
# policies/safety.toml
[[rule]]
mcpName = "my_server"
toolName = "dangerous_tool"
decision = "ask_user"
priority = 100

[[safety_checker]]
mcpName = "my_server"
toolName = "write_data"
priority = 200

[safety_checker.checker]
type = "in-process"
name = "allowed-path"
required_context = ["environment"]
```

---

## 6. Constraints and Limitations

### Security Constraints

1. **Environment Variable Sanitization**: Extensions only receive explicitly declared env vars plus standard safe vars. No access to user's full shell environment.
2. **Extension Policy Restrictions**: Extension policies run in tier 2. **Extensions CANNOT** use `allow` decisions or `yolo` mode - these are ignored for security.
3. **No `trust` in MCP Config**: The `trust` field is not supported in `mcpServers` within extensions.
4. **Command Conflicts**: Extension commands have lowest precedence. If a conflict exists, the command is prefixed with extension name (e.g., `/gcp.deploy`).
5. **Hooks execute with user privileges** - always review third-party hook source code.

### Technical Limitations

1. **Hooks are synchronous** - delays in hook scripts delay the agent's response. Keep hooks fast.
2. **SessionEnd hooks are best-effort** - CLI will not wait for completion.
3. **Notification hooks cannot block** or auto-grant permissions.
4. **PreCompress hooks cannot block** compression.
5. **BeforeToolSelection** does not support `decision`, `continue`, or `systemMessage`.
6. **AfterModel fires for every chunk** during streaming - modifying response only affects current chunk.
7. **Extensions must restart CLI** for management operations to take effect.

### Discovery Constraints

1. Skills are discovered one directory deep only: `.gemini/skills/<skill>/SKILL.md`
2. `SKILL.md` must have exact filename (case-sensitive on Linux/macOS)
3. Must have both `name:` and `description:` in YAML frontmatter as the FIRST content
4. Workspace skills require trusted folder (`/trust` command)

### Version/Compatibility

- Gemini CLI v0.26.0+ introduced hooks support
- Gemini CLI v0.4.0+ supports extensions
- Sub-agents are a preview feature under active development

---

## 7. Code Examples

### Minimal Extension (MCP Server)

**`gemini-extension.json`:**
```json
{
  "name": "cloud-run",
  "version": "1.0.0",
  "mcpServers": {
    "cloud-run": {
      "command": "npx",
      "args": ["-y", "@google-cloud/cloud-run-mcp"]
    }
  },
  "contextFileName": "gemini-extension/GEMINI.md"
}
```

### Extension with Settings

**`gemini-extension.json`:**
```json
{
  "name": "my-api-extension",
  "version": "1.0.0",
  "description": "Connects to My API service",
  "settings": [
    {
      "name": "API Key",
      "description": "Your API key for the service.",
      "envVar": "MY_API_KEY",
      "sensitive": true
    },
    {
      "name": "API URL",
      "description": "Custom API endpoint.",
      "envVar": "MY_API_URL",
      "sensitive": false
    }
  ],
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["${extensionPath}/server.js"],
      "cwd": "${extensionPath}"
    }
  }
}
```

### Extension with Custom Commands

**File structure:**
```
my-extension/
├── gemini-extension.json
└── commands/
    ├── deploy.toml       # → /deploy
    └── db/
        └── migrate.toml  # → /db:migrate
```

**`commands/deploy.toml`:**
```toml
description = "Deploy the application to production"
prompt = """
Review the current state of the codebase, ensure all tests pass,
and then deploy to production using the appropriate deployment method.
"""
```

### Extension with Hooks

**`gemini-extension.json`:**
```json
{
  "name": "ralph",
  "version": "1.0.1"
}
```

**`hooks/hooks.json`:**
```json
{
  "hooks": {
    "AfterAgent": [
      {
        "matcher": "*",
        "hooks": [
          {
            "name": "ralph-loop",
            "type": "command",
            "command": "${extensionPath}/hooks/stop-hook.sh",
            "description": "The Ralph infinite loop mechanism"
          }
        ]
      }
    ]
  }
}
```

**`hooks/stop-hook.sh`:**
```bash
#!/usr/bin/env bash
# Read hook input from stdin
input=$(cat)

# Check state and decide whether to continue looping
if [ -f ".gemini/ralph/state.json" ]; then
    state=$(cat .gemini/ralph/state.json)
    current=$(echo "$state" | jq -r '.current_iteration')
    max=$(echo "$state" | jq -r '.max_iterations')
    
    if [ "$max" -gt 0 ] && [ "$current" -ge "$max" ]; then
        echo '{"decision": "allow"}'
        exit 0
    fi
    
    # Continue the loop
    cat <<EOF
{
    "decision": "deny",
    "reason": "Ralph loop continuation - iteration not complete.",
    "hookSpecificOutput": {
        "clearContext": true
    }
}
EOF
    exit 0
fi

echo '{"decision": "allow"}'
exit 0
```

### Extension with Agent Skills

**`gemini-extension.json`:**
```json
{
  "name": "security-toolkit",
  "version": "1.0.0"
}
```

**`skills/audit/SKILL.md`:**
```markdown
---
name: security-audit
description: >
  Expertise in security auditing and vulnerability scanning.
  Use when the user asks to "audit", "scan", or "check security".
---

# Security Audit Instructions

When activated, perform a comprehensive security audit:

1. **Dependency Scan**: Check for known vulnerabilities in dependencies
2. **Secret Detection**: Scan for exposed API keys, passwords, or tokens
3. **Code Analysis**: Review for common security anti-patterns
4. **Report**: Provide findings with severity levels and remediation steps

Use the bundled `scripts/scan.sh` tool for automated scanning.
```

### Extension with Policies

**`policies/safety.toml`:**
```toml
[[rule]]
mcpName = "my_server"
toolName = "dangerous_tool"
decision = "ask_user"
priority = 100

[[rule]]
toolName = "run_shell_command"
commandPrefix = "rm -rf"
decision = "deny"
priority = 1000

[[safety_checker]]
mcpName = "my_server"
toolName = "write_data"
priority = 200

[safety_checker.checker]
type = "in-process"
name = "allowed-path"
required_context = ["environment"]
```

### Secret Scanning Hook (Security Example)

**`hooks/hooks.json`:**
```json
{
  "hooks": {
    "BeforeTool": [
      {
        "matcher": "write_file|replace",
        "hooks": [
          {
            "name": "secret-scanner",
            "type": "command",
            "command": "${extensionPath}/scripts/block-secrets.sh",
            "description": "Prevent committing secrets"
          }
        ]
      }
    ]
  }
}
```

**`scripts/block-secrets.sh`:**
```bash
#!/usr/bin/env bash
input=$(cat)
content=$(echo "$input" | jq -r '.tool_input.content // .tool_input.new_string // ""')

if echo "$content" | grep -qE 'api[_-]?key|password|secret|AKIA[0-9A-Z]{16}'; then
    cat <<EOF
{
  "decision": "deny",
  "reason": "Security Policy: Potential secret detected in content.",
  "systemMessage": "Security scanner blocked operation"
}
EOF
    exit 0
fi

echo '{"decision": "allow"}'
exit 0
```

---

## 8. Extension Templates Available

Built-in templates via `gemini extensions new <path> [template]`:

| Template | Purpose |
|----------|---------|
| `mcp-server` | MCP server extension with Node.js example |
| `context` | Context-only extension (GEMINI.md) |
| `custom-commands` | Extension with custom slash commands |

---

## 9. Comparison Summary

| Feature | Format | Location | Invocation |
|---------|--------|----------|------------|
| **MCP Servers** | JSON config | `gemini-extension.json` | Model calls tools automatically |
| **Custom Commands** | TOML files | `commands/*.toml` | User types `/command` |
| **Context** | Markdown | `GEMINI.md` | Auto-loaded at session start |
| **Skills** | Markdown + YAML | `skills/<name>/SKILL.md` | Model activates when needed |
| **Hooks** | JSON + scripts | `hooks/hooks.json` | CLI lifecycle events |
| **Sub-agents** | Markdown | `agents/*.md` | User delegates tasks |
| **Policies** | TOML | `policies/*.toml` | Auto-enforced on tool calls |
| **Themes** | JSON | `gemini-extension.json` | User via `/theme` command |

---

*Report generated from official Gemini CLI documentation and real-world extension source code. All schemas and examples are verified against published specifications.*
