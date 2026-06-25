# Moonshot Kimi Plugin/Extension System - Technical Research Report

## Executive Summary

Moonshot Kimi's extension ecosystem is a **multi-layered architecture** spanning three distinct extension mechanisms:

1. **Kimi Code CLI Plugin System** - A formal plugin architecture for the Kimi Code CLI (the primary developer-facing plugin system)
2. **API Tool Use / Function Calling** - OpenAI-compatible tool use for extending model capabilities at the API level
3. **MCP (Model Context Protocol) Integration** - Standard protocol for connecting external tools to Kimi Code CLI

**Note**: Kimi does NOT have a traditional "plugin marketplace" for the web chat interface (kimi.com). The formal plugin system is specifically for **Kimi Code CLI**. The web interface uses built-in "Kimi+" agents and official tools rather than a user-installable plugin system.

---

## 1. Plugin Manifest Format (Kimi Code CLI)

### File Locations (Resolution Order)

The manifest file can be placed at either location (with `kimi.plugin.json` taking precedence):

```
<plugin_root>/kimi.plugin.json          # Primary
<plugin_root>/.kimi-plugin/plugin.json  # Fallback
```

### Manifest Schema

```json
{
  "name": "kimi-finance",
  "version": "1.0.0",
  "description": "Finance data and analysis workflows for Kimi Code CLI",
  "keywords": ["finance", "stocks", "crypto"],
  "author": "Developer Name",
  "homepage": "https://github.com/user/kimi-finance",
  "license": "Apache-2.0",
  "skills": "./skills/",
  "sessionStart": {
    "skill": "using-finance"
  },
  "skillInstructions": "Always check market hours before providing trading advice",
  "interface": {
    "displayName": "Kimi Finance",
    "shortDescription": "Market data and financial analysis workflows",
    "longDescription": "Comprehensive financial analysis including stock screening, portfolio tracking, and market news",
    "developerName": "Finance Team",
    "websiteURL": "https://finance.example.com"
  },
  "mcpServers": {
    "finance-api": {
      "url": "https://mcp.finance.example.com/mcp",
      "headers": {
        "X-API-KEY": "${FINANCE_API_KEY}"
      }
    }
  }
}
```

### Required Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `name` | string | Regex: `[a-z0-9][a-z0-9_-]{0,63}` | Plugin identifier (also used as installation ID) |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Semantic version |
| `description` | string | Human-readable description |
| `keywords` | string[] | Search keywords |
| `author` | string | Author name |
| `homepage` | string | Project homepage URL |
| `license` | string | SPDX license identifier |
| `skills` | string | Relative path(s) to skill directories |
| `sessionStart.skill` | string | Auto-load this skill on session start |
| `skillInstructions` | string | Additional instructions appended when plugin skills load |
| `interface.displayName` | string | Friendly name shown in plugin manager |
| `interface.shortDescription` | string | Short summary for plugin list |
| `interface.longDescription` | string | Detailed description |
| `interface.developerName` | string | Developer/organization name |
| `interface.websiteURL` | string | Link to developer website |
| `mcpServers` | object | MCP server declarations |

### Ignored Fields (Diagnostics Only)

The following fields appear in diagnostics but are **ignored** (unsupported):
- `tools`
- `commands`
- `hooks`
- `apps`
- `inject`
- `configFile`

---

## 2. Hook Types Available (Lifecycle Events & Callbacks)

Hooks are configured in `~/.kimi-code/config.toml` using the `[[hooks]]` table array.

### Hook Configuration Schema (TOML)

```toml
[[hooks]]
event = "PreToolUse"           # Required: which event to trigger on
matcher = "Bash"                # Required: which target to match
command = "node /path/to/hook.mjs"  # Required: script to run
timeout = 5000                  # Optional: timeout in ms (default: 60000)
name = "block-dangerous-rm"     # Optional: friendly name for logs
description = "Blocks rm -rf commands"  # Optional: purpose description
```

### Blockable Events (Can Intercept & Modify Behavior)

| Event | Matcher Pattern | Supports Blocking | Description |
|-------|----------------|-------------------|-------------|
| `UserPromptSubmit` | User input text | Yes | Fired when user sends a message; returned text appended to context |
| `PreToolUse` | Tool name (regex) | Yes | Fired before a tool call; can block execution |
| `Stop` | Empty string | Yes | Fired when model about to end current turn; can force continuation |

### Observation-Only Events (Fire & Forget)

| Event | Matcher Pattern | Description |
|-------|----------------|-------------|
| `SessionStart` | Session start reason | Fired when a new session starts |
| `SessionEnd` | `exit` | Fired after session closes |
| `SubagentStart` | Sub-agent name | Fired before sub-agent starts |
| `SubagentStop` | Sub-agent name | Fired after sub-agent completes |
| `StopFailure` | Error type | Fired when current turn fails |
| `PreCompact` | `manual` or `auto` | Fired before context compaction |
| `PostCompact` | `manual` or `auto` | Fired after context compaction completes |
| `Notification` | Notification type (e.g., `task.completed`) | Fired on background task status changes |

### Hook Script Input (JSON via stdin)

```json
{
  "hook_event_name": "PreToolUse",
  "session_id": "session_abc",
  "cwd": "/path/to/project",
  "timestamp": "2026-01-15T10:30:00Z"
}
```

Event-specific additional fields:
- `PreToolUse`: `tool_name`, `tool_input`, `mcp_context`, `original_request_name`
- `UserPromptSubmit`: `user_prompt`
- `Stop`: (no additional fields)
- `Notification`: `notification_type`, `notification_data`

### Hook Script Output

| Exit Code | Meaning | CLI Behavior |
|-----------|---------|--------------|
| `0` | Allow | Continue execution; stdout may be appended to context |
| `2` | Block | Stop current operation; stderr used as blocking reason |
| Other non-zero | Script error | Default allow (fail-open) |
| Timeout/crash | Exception | Default allow (fail-open) |

JSON return for blocking:
```json
{
  "hookSpecificOutput": {
    "permissionDecision": "deny",
    "permissionDecisionReason": "Please use rg instead of grep"
  }
}
```

### Example: Blocking Dangerous Commands

```toml
# ~/.kimi-code/config.toml
[[hooks]]
event = "PreToolUse"
matcher = "Bash"
command = "node ~/.kimi-code/hooks/block-dangerous-bash.mjs"
timeout = 5
```

```javascript
// block-dangerous-bash.mjs
let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const payload = JSON.parse(input);
  const command = payload.tool_input?.command ?? '';
  if (command.includes('rm -rf')) {
    console.error('Dangerous command detected, blocked');
    process.exit(2);  // Block
  }
  process.exit(0);  // Allow
});
```

---

## 3. Registration Mechanism

### Plugin Installation Methods

Plugins are installed via the Kimi Code CLI TUI or slash commands:

```
/plugins                          # Open interactive plugin manager
/plugins list                     # List installed plugins
/plugins install <path-or-url>    # Install from local dir, zip URL, or GitHub URL
/plugins marketplace [source]     # Browse official marketplace
/plugins info <id>                # View plugin details and diagnostics
/plugins enable <id>              # Enable a plugin
/plugins disable <id>             # Disable a plugin
/plugins remove <id>              # Remove a plugin
/plugins reload                   # Reload installed.json and all manifests
/plugins mcp enable <id> <server> # Enable MCP server from plugin
/plugins mcp disable <id> <server># Disable MCP server from plugin
```

### GitHub URL Formats Supported

| Format | Behavior |
|--------|----------|
| `https://github.com/<owner>/<repo>` | Install latest release; fallback to default branch |
| `https://github.com/<owner>/<repo>/tree/<ref>` | Install specific branch/tag/commit |
| `https://github.com/<owner>/<repo>/releases/tag/<tag>` | Pin to specific tag |
| `https://github.com/<owner>/<repo>/commit/<sha>` | Pin to specific commit |

### Installation Process

1. Plugin is downloaded/copied to `$KIMI_CODE_HOME/plugins/managed/<id>/`
2. CLI always runs from this **managed copy** (not the original source)
3. Changes to original source require **reinstall** to take effect
4. Installation record tracked in `installed.json`

### Loading Strategy

- **Conservative loading**: Installing a plugin does NOT execute any Python, Node.js, shell, hook, or command scripts it contains
- Plugin changes only take effect for **new sessions** (`/new` command required)
- Currently installed **per-user** (applies to all projects); project-level scope not yet supported

### Trust Badges

| Badge | Source Type |
|-------|-------------|
| `kimi-official` | Official Moonshot address |
| `curated` | Curated marketplace address |
| `third-party` | Everything else |

---

## 4. Configuration Schema

### User-Level Configuration

**Location**: `~/.kimi-code/config.toml` (or `$KIMI_CODE_HOME/config.toml`)

```toml
# Provider configuration
[provider]
model = "kimi-k2.6"
api_key = "sk-..."
base_url = "https://api.moonshot.ai/v1"

# Hook rules
[[hooks]]
event = "PreToolUse"
matcher = "Bash"
command = "node ~/.kimi-code/hooks/safety-check.mjs"
timeout = 5000

[[hooks]]
event = "Notification"
matcher = "task.completed"
command = "terminal-notifier -title Kimi -message 'Task done'"

# Permission rules
[[permissions]]
tool = "Bash"
pattern = "npm test"
action = "allow"
```

### MCP Server Configuration

**User-level**: `~/.kimi-code/mcp.json`
**Project-level**: `.kimi-code/mcp.json` (takes precedence)

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    },
    "linear": {
      "url": "https://mcp.linear.app/mcp",
      "headers": {
        "Authorization": "Bearer ${LINEAR_API_KEY}"
      }
    }
  }
}
```

### Configuration Files Reference

| File | Location | Purpose |
|------|----------|---------|
| `config.toml` | `~/.kimi-code/` | Main configuration (hooks, permissions, provider) |
| `mcp.json` | `~/.kimi-code/` or `./.kimi-code/` | MCP server definitions |
| `kimi.plugin.json` | Plugin root | Plugin manifest |
| `installed.json` | `~/.kimi-code/plugins/` | Installation registry |

---

## 5. File Structure Expected

### Minimal Plugin Structure

```
my-plugin/
├── kimi.plugin.json          # Plugin manifest (required)
└── skills/
    └── my-workflow/
        └── SKILL.md          # Skill definition
```

### Full Plugin Structure

```
my-plugin/
├── kimi.plugin.json          # Plugin manifest
├── README.md                 # Documentation
├── LICENSE                   # License file
└── skills/                   # Skill definitions
    ├── using-my-plugin/
    │   ├── SKILL.md          # Main skill file
    │   └── examples/         # Supporting files
    │       └── sample-data.json
    └── advanced-workflow/
        ├── SKILL.md
        └── templates/
            └── template.py
```

### Skill File Format (SKILL.md)

```markdown
---
name: code-style
description: Project code style guidelines defining naming, indentation, comments, and file organization
type: prompt
whenToUse: When the user asks me to write, modify, or review project source code
disableModelInvocation: false
arguments:
  - target
  - mode
---

# Code Style Guidelines

Please handle code according to the following guidelines:
- Use 2-space indentation
- Variable names use `camelCase`, type names use `PascalCase`
- Public functions must have TSDoc comments
- Lines must not exceed 100 characters
```

### Skill Frontmatter Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Skill name (case-insensitive) |
| `description` | string | One-line summary for model to decide usage |
| `type` | string | `"prompt"` or `"tool"` |
| `whenToUse` | string | Context for auto-invocation decision |
| `disableModelInvocation` | boolean | If true, only loaded via explicit slash command |
| `arguments` | string[] | Required arguments referenced in body |

### Data Locations

| Data Type | Default Location | Override via |
|-----------|-----------------|--------------|
| Config | `~/.kimi-code/` | `$KIMI_CODE_HOME` |
| Managed Plugins | `~/.kimi-code/plugins/managed/<id>/` | - |
| Plugin Registry | `~/.kimi-code/plugins/installed.json` | - |
| Session Data | `~/.kimi-code/sessions/` | - |
| MCP Config | `~/.kimi-code/mcp.json` | - |
| Hooks | `~/.kimi-code/hooks/` | - |

---

## 6. Constraints & Limitations

### Security Model

- **Fail-open design**: Hook script errors/timeouts do NOT block the main flow
- **Conservative plugin loading**: No code execution on plugin install
- **Managed copy isolation**: CLI runs from managed copy, not original source
- **Trust-based installation**: Three-tier trust system (official/curated/third-party)
- **No project-level plugins**: Currently user-level only
- **Session restart required**: Plugin changes need `/new` to take effect

### API-Level Constraints (Tool Use)

| Constraint | Value |
|------------|-------|
| Max tools per request | 128 |
| Tool name regex | `^[a-zA-Z_][a-zA-Z0-9-_]{2,63}$` |
| Parameters schema | Subset of JSON Schema (MFJS specification) |
| `tool_choice` values | `auto`, `none` (NOT `required` - not yet supported) |
| `strict` parameter default | `true` (enforces MFJS schema compliance) |

### MCP Constraints

| Constraint | Value |
|------------|-------|
| Transport types | `stdio` (local), `HTTP` (remote) |
| Config levels | User-level + Project-level (project overrides user) |
| Server naming | `mcp_<server_name>_<tool_name>` pattern for tool names |

### Rate Limits (Kimi Code)

| Tier | Requests per 5 hours | Concurrent requests |
|------|---------------------|---------------------|
| Standard | 300-1,200 | Up to 30 |

### Unsupported Plugin Fields

The following manifest fields are **recognized but ignored**:
- `tools` - No direct tool definitions in manifest
- `commands` - No command registration
- `hooks` - Hooks must be in user config, not plugin
- `apps` - No app embedding
- `inject` - No injection mechanism
- `configFile` - No bundled config

---

## 7. Code Examples

### Minimal Plugin Example

**File: `kimi.plugin.json`**
```json
{
  "name": "hello-kimi",
  "version": "1.0.0",
  "description": "A minimal example plugin",
  "interface": {
    "displayName": "Hello Kimi",
    "shortDescription": "Minimal example plugin"
  }
}
```

### Plugin with Skill and Session Auto-Start

**File: `kimi.plugin.json`**
```json
{
  "name": "python-best-practices",
  "version": "1.0.0",
  "description": "Python coding best practices and linting rules",
  "skills": "./skills/",
  "sessionStart": {
    "skill": "python-style"
  },
  "interface": {
    "displayName": "Python Best Practices",
    "shortDescription": "Coding standards for Python projects"
  }
}
```

**File: `skills/python-style/SKILL.md`**
```markdown
---
name: python-style
description: Python coding standards including PEP 8 compliance and type hinting
type: prompt
whenToUse: When writing, reviewing, or refactoring Python code
---

# Python Best Practices

Follow these rules for all Python code:
- PEP 8 compliance (4-space indentation, 79 char line limit)
- Type hints on all function signatures
- Docstrings for all public functions (Google style)
- Use `pathlib` instead of `os.path`
- Prefer `dataclasses` over manual `__init__` methods
```

### Plugin with MCP Server

**File: `kimi.plugin.json`**
```json
{
  "name": "kimi-database",
  "version": "2.1.0",
  "description": "Database query and analysis tools",
  "skills": "./skills/",
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]
    }
  },
  "interface": {
    "displayName": "Kimi Database Tools",
    "shortDescription": "SQL query and database analysis"
  }
}
```

### API-Level Tool Use Example

```python
from openai import OpenAI

client = OpenAI(
    api_key="$MOONSHOT_API_KEY",
    base_url="https://api.moonshot.ai/v1",
)

tools = [{
    "type": "function",
    "function": {
        "name": "CodeRunner",
        "description": "A code executor that supports running Python and JavaScript code",
        "parameters": {
            "properties": {
                "language": {
                    "type": "string",
                    "enum": ["python", "javascript"]
                },
                "code": {
                    "type": "string",
                    "description": "The code to execute"
                }
            },
            "type": "object"
        }
    }
}]

completion = client.chat.completions.create(
    model="kimi-k2.6",
    messages=[
        {"role": "system", "content": "You are Kimi, an AI assistant provided by Moonshot AI."},
        {"role": "user", "content": "Determine whether 3214567 is a prime number through programming."}
    ],
    tools=tools
)

# Handle tool calls
if completion.choices[0].finish_reason == "tool_calls":
    for tool_call in completion.choices[0].message.tool_calls:
        print(f"Tool: {tool_call.function.name}")
        print(f"Args: {tool_call.function.arguments}")
```

### Official Tools via Formula API

```python
import httpx
from openai import AsyncOpenAI

client = AsyncOpenAI(
    base_url="https://api.moonshot.ai/v1",
    api_key="$MOONSHOT_API_KEY"
)

async def use_official_tool():
    # Fetch tool definitions for the web-search formula
    formula_uri = "moonshot/web-search:latest"
    
    async with httpx.AsyncClient() as http:
        tools_response = await http.get(
            f"https://api.moonshot.ai/v1/formulas/{formula_uri}/tools",
            headers={"Authorization": "Bearer $MOONSHOT_API_KEY"}
        )
        tools = tools_response.json().get("tools", [])
    
    # Use the tool in chat
    response = await client.chat.completions.create(
        model="kimi-k2.6",
        messages=[{"role": "user", "content": "Latest news about AI regulations"}],
        tools=tools
    )
    return response
```

---

## 8. Comparison of Extension Mechanisms

| Feature | Kimi Code Plugins | API Tool Use | MCP Servers | Kimi WebBridge |
|---------|------------------|--------------|-------------|----------------|
| **Scope** | Kimi Code CLI | Any API client | Kimi Code CLI | Browser automation |
| **Type** | Declarative manifest | Runtime API parameter | External process | Chrome extension |
| **Capabilities** | Skills + MCP servers | Custom function calling | External tool access | Web page interaction |
| **Installation** | `/plugins install` | N/A (API-level) | `mcp.json` config | Chrome Web Store |
| **Distribution** | GitHub URL, local path | N/A | npm/PyPI/Docker | Chrome Web Store |
| **Security** | Trust badges, managed copy | API key auth | User-controlled | Local-only execution |
| **Code execution** | No (conservative) | On client side | In MCP server process | In browser via CDP |

---

## 9. Official Tools Available via API

| Tool URI | Description |
|----------|-------------|
| `moonshot/web-search:latest` | Real-time internet search |
| `moonshot/rethink:latest` | Intelligent reasoning |
| `moonshot/random-choice:latest` | Random selection |
| `moonshot/memory:latest` | Persistent memory storage |
| `moonshot/excel:latest` | Excel/CSV file analysis |
| `moonshot/date:latest` | Date and time processing |
| `moonshot/base64:latest` | Base64 encoding/decoding |
| `moonshot/fetch:latest` | URL content extraction |
| `moonshot/quickjs:latest` | JavaScript code execution |
| `moonshot/code_runner:latest` | Python code execution |
| `moonshot/convert:latest` | Unit conversion |

---

## 10. Sources

1. [Kimi Code CLI Plugins Documentation](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/plugins.html)
2. [Kimi Code CLI Hooks Documentation](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html)
3. [Kimi Code CLI MCP Documentation](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/mcp.html)
4. [Kimi Code CLI Skills Documentation](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/skills.html)
5. [Kimi Code CLI Agents Documentation](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/agents.html)
6. [Kimi API Tool Use Documentation](https://platform.kimi.ai/docs/api/tool-use.md)
7. [Kimi API Official Tools Guide](https://platform.kimi.ai/docs/guide/use-official-tools)
8. [Kimi CLI GitHub Repository](https://github.com/MoonshotAI/kimi-cli)
9. [Kimi VS Code Extension](https://marketplace.visualstudio.com/items?itemName=moonshot-ai.kimi-code)
10. [Kimi WebBridge Browser Extension](https://kimi.com/features/webbridge)
11. [Kimi K2 GitHub Repository](https://github.com/MoonshotAI/Kimi-K2)
12. [Kimi API Platform Documentation](https://platform.kimi.ai/docs/overview)

---

*Report generated on 2026-01-15. Kimi platform features evolve rapidly; verify current documentation at platform.kimi.ai.*
