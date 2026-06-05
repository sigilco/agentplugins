# OpenAI Codex Plugin System - Technical Research Report

## Sources
- Primary Documentation: https://developers.openai.com/codex/plugins
- Build Plugins: https://developers.openai.com/codex/plugins/build
- Hooks Reference: https://developers.openai.com/codex/hooks
- JSON Schemas: https://github.com/openai/codex/tree/main/codex-rs/hooks/schema/generated
- Plugin Creator Skill: https://github.com/openai/codex/blob/main/codex-rs/skills/src/assets/samples/plugin-creator/SKILL.md

---

## 1. Plugin Manifest Format (plugin.json)

### Required Fields (Minimal Manifest)

```json
{
  "name": "my-first-plugin",
  "version": "1.0.0",
  "description": "Reusable greeting workflow",
  "skills": "./skills/"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Plugin identifier in kebab-case (<=64 chars). Used as namespace. |
| `version` | string | Yes | Semantic version (e.g., `1.0.0`) |
| `description` | string | Yes | One-line summary of the plugin |
| `skills` | string | Yes* | Relative path to skills directory (e.g., `./skills/`) |

*Note: `skills`, `mcpServers`, `apps`, or `hooks` - at least one component pointer should be present.

### Complete Manifest Schema (Published Plugins)

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "Bundle reusable skills and app integrations.",
  "author": {
    "name": "Your team",
    "email": "team@example.com",
    "url": "https://example.com"
  },
  "homepage": "https://example.com/plugins/my-plugin",
  "repository": "https://github.com/example/my-plugin",
  "license": "MIT",
  "keywords": ["research", "crm"],
  "skills": "./skills/",
  "mcpServers": "./.mcp.json",
  "apps": "./.app.json",
  "hooks": "./hooks/hooks.json",
  "interface": {
    "displayName": "My Plugin",
    "shortDescription": "Reusable skills and apps",
    "longDescription": "Distribute skills and app integrations together.",
    "developerName": "Your team",
    "category": "Productivity",
    "capabilities": ["Read", "Write"],
    "websiteURL": "https://example.com",
    "privacyPolicyURL": "https://example.com/privacy",
    "termsOfServiceURL": "https://example.com/terms",
    "defaultPrompt": [
      "Use My Plugin to summarize new CRM notes.",
      "Use My Plugin to triage new customer follow-ups."
    ],
    "brandColor": "#10A37F",
    "composerIcon": "./assets/icon.png",
    "logo": "./assets/logo.png",
    "screenshots": ["./assets/screenshot-1.png"]
  }
}
```

### Manifest Field Reference

#### Top-Level Identity & Metadata

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Plugin identifier (kebab-case, <=64 chars) |
| `version` | string | Yes | Semantic version |
| `description` | string | Yes | Short description |
| `author` | object | No | `{name, email, url}` |
| `homepage` | string | No | Plugin homepage URL |
| `repository` | string | No | Source repository URL |
| `license` | string | No | SPDX license identifier |
| `keywords` | string[] | No | Discovery keywords |

#### Component Pointers

| Field | Type | Description |
|-------|------|-------------|
| `skills` | string | Path to skills directory (e.g., `./skills/`) |
| `mcpServers` | string | Path to `.mcp.json` file |
| `apps` | string | Path to `.app.json` file |
| `hooks` | string \| string[] \| object \| object[] | Path to hooks file(s) or inline hooks object(s) |

**Path Rules:**
- All paths must be relative to plugin root and start with `./`
- Visual assets should be stored under `./assets/`
- Hooks can be: single path, array of paths, inline hooks object, or array of inline hooks objects

#### Interface Object (Install-Surface Metadata)

| Field | Type | Description |
|-------|------|-------------|
| `displayName` | string | Human-readable plugin name |
| `shortDescription` | string | Brief description for listings |
| `longDescription` | string | Full description for detail view |
| `developerName` | string | Publisher/team name |
| `category` | string | Category label (e.g., `Productivity`) |
| `capabilities` | string[] | Capability labels (e.g., `["Read", "Write"]`) |
| `websiteURL` | string | External website link |
| `privacyPolicyURL` | string | Privacy policy link |
| `termsOfServiceURL` | string | Terms of service link |
| `defaultPrompt` | string[] | Starter prompts shown to users |
| `brandColor` | string | Hex color for branding |
| `composerIcon` | string | Path to icon (e.g., `./assets/icon.png`) |
| `logo` | string | Path to logo |
| `screenshots` | string[] | Array of screenshot paths |

---

## 2. Hook Types (Lifecycle Events)

Codex supports the following lifecycle hook events. All hooks are command-based (executable scripts).

### Hook Event Reference

| Hook Event | Matcher Field | Scope | Description |
|------------|--------------|-------|-------------|
| `SessionStart` | `source` | Thread/Subagent-start | Fires when session starts (startup, resume, clear, compact) |
| `SubagentStart` | `agent_type` | Thread/Subagent-start | Fires when a subagent starts |
| `PreToolUse` | `tool_name` | Turn | Intercepts tool calls before execution (Bash, apply_patch, MCP) |
| `PermissionRequest` | `tool_name` | Turn | Fires when tool requires permission approval |
| `PostToolUse` | `tool_name` | Turn | Runs after tool execution completes |
| `PreCompact` | (matcher unused) | Turn | Fires before conversation compaction |
| `PostCompact` | (matcher unused) | Turn | Fires after conversation compaction |
| `UserPromptSubmit` | (matcher unused) | Turn | Fires before user's prompt is processed |
| `SubagentStop` | (matcher unused) | Turn | Fires when a subagent stops |
| `Stop` | (matcher unused) | Turn | Fires when a conversation turn stops |

### Hook Runtime Behavior
- **Multiple matching hooks all run** - no hook can prevent another from starting
- **Multiple matching command hooks for the same event run concurrently**
- **Non-managed hooks require trust review** before execution
- **Plugin-bundled hooks** are non-managed and use the same trust-review flow

### Hook Trust & Review
- Codex records trust against a hook's hash
- New/changed hooks require re-review
- Use `/hooks` CLI command to inspect, review, trust, or disable hooks
- Managed hooks (system, MDM, cloud, requirements.toml) are trusted by policy
- Pass `--dangerously-bypass-hook-trust` for automation that vets hooks externally

### Common Input Fields (All Hooks)

| Field | Type | Description |
|-------|------|-------------|
| `cwd` | string | Current working directory |
| `hook_event_name` | string | Name of the hook event |
| `model` | string | Active model name |
| `permission_mode` | string | Current permission mode (`default`, `acceptEdits`, `plan`, `dontAsk`, `bypassPermissions`) |
| `session_id` | string | Session identifier |
| `transcript_path` | string \| null | Path to transcript file |

### Hook-Specific Input Fields

#### SessionStart
| Field | Type | Description |
|-------|------|-------------|
| `source` | string | `startup`, `resume`, `clear`, or `compact` |

#### SubagentStart
| Field | Type | Description |
|-------|------|-------------|
| `turn_id` | string | Active Codex turn id |
| `agent_id` | string | Subagent identifier |
| `agent_type` | string | Subagent type or profile |
| `permission_mode` | string | Current permission mode |

#### PreToolUse
| Field | Type | Description |
|-------|------|-------------|
| `turn_id` | string | Active turn id |
| `agent_id` | string | Agent identifier |
| `agent_type` | string | Agent type/profile |
| `tool_name` | string | Name of the tool being called |
| `tool_use_id` | string | Unique tool invocation id |
| `tool_input` | any | Tool arguments/payload |

#### SubagentStop
| Field | Type | Description |
|-------|------|-------------|
| `turn_id` | string | Active turn id |
| `agent_type` | string | Subagent type/profile |
| `agent_transcript_path` | string \| null | Path to subagent transcript |
| `stop_hook_active` | boolean | Whether subagent was already continued |
| `last_assistant_message` | string \| null | Latest assistant message |

#### Stop
| Field | Type | Description |
|-------|------|-------------|
| `turn_id` | string | Active Codex turn id |
| `stop_hook_active` | boolean | Whether turn was already continued |
| `last_assistant_message` | string \| null | Latest assistant message |

### Common Output Fields (JSON on stdout)

| Field | Type | Effect |
|-------|------|--------|
| `continue` | boolean | If `false`, marks hook run as stopped |
| `stopReason` | string | Recorded reason for stopping |
| `systemMessage` | string | Warning surfaced in UI/event stream |
| `suppressOutput` | boolean | Parsed but not yet implemented |

### Hook-Specific Output Shapes

#### SessionStart
```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Load the workspace conventions before editing."
  }
}
```
The `additionalContext` is added as extra developer context.

#### SubagentStart
```json
{
  "hookSpecificOutput": {
    "hookEventName": "SubagentStart",
    "additionalContext": "Review the repository test conventions first."
  }
}
```

#### SubagentStop / Stop
To ask Codex to continue the flow, return:
```json
{
  "decision": "block",
  "reason": "Run one more focused pass."
}
```
Exit code `2` with reason on `stderr` is also valid.
If any matching hook returns `continue: false`, it takes precedence.

#### PreToolUse / PermissionRequest
Only `systemMessage` is supported. `continue`, `stopReason`, and `suppressOutput` are NOT supported.

#### PostToolUse
Supports `systemMessage`, `continue: false`, and `stopReason`.

---

## 3. Registration Mechanism

### How Plugins Are Discovered

Plugins are discovered through **marketplaces** - JSON catalogs that Codex reads.

### Marketplace Sources (in order)

1. **Curated marketplace** (official Plugin Directory from OpenAI)
2. **Repo marketplace**: `$REPO_ROOT/.agents/plugins/marketplace.json`
3. **Legacy marketplace**: `$REPO_ROOT/.claude-plugin/marketplace.json`
4. **Personal marketplace**: `~/.agents/plugins/marketplace.json`

### Marketplace Format (marketplace.json)

```json
{
  "name": "local-repo",
  "interface": {
    "displayName": "My Local Repo Plugins"
  },
  "plugins": [
    {
      "name": "my-plugin",
      "source": {
        "source": "local",
        "path": "./plugins/my-plugin"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

### Marketplace Entry Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Plugin identifier |
| `source.path` | string | Yes | Relative path to plugin folder (starts with `./`) |
| `policy.installation` | string | Yes | `AVAILABLE` or other policy value |
| `policy.authentication` | string | Yes | `ON_INSTALL` or other auth policy |
| `category` | string | Yes | Category label |
| `policy.products` | string[] | No | Product override (only when explicitly requested) |

### Plugin Installation Path

Plugins are installed into:
```
~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/
```

For local plugins, `$VERSION` is `local`.

### Enable/Disable State

Plugin on/off state is stored in:
```
~/.codex/config.toml
```

### Using @plugin-creator Skill

The built-in `@plugin-creator` skill scaffolds plugins:

```bash
# Create basic plugin (stored in ~/plugins/<plugin-name>)
python3 scripts/create_basic_plugin.py <plugin-name>

# With marketplace entry
python3 scripts/create_basic_plugin.py my-plugin --with-marketplace

# With optional components
python3 scripts/create_basic_plugin.py my-plugin \
  --with-skills --with-hooks --with-scripts \
  --with-assets --with-mcp --with-apps --with-marketplace
```

### Manual Registration Flow

1. Create plugin folder with `.codex-plugin/plugin.json`
2. Create/update `~/.agents/plugins/marketplace.json` with plugin entry
3. Restart Codex
4. Open plugin directory and browse/install

---

## 4. Configuration Schema

### Hooks Configuration (hooks.json)

Hooks are organized in three levels:
1. **Hook Event** (e.g., `SessionStart`, `PreToolUse`)
2. **Matcher Group** (decides when event matches)
3. **Hook Handlers** (run when matcher matches)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.codex/hooks/session_start.py",
            "statusMessage": "Loading session notes"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "/usr/bin/python3 \"$(git rev-parse --show-toplevel)/.codex/hooks/pre_tool_use_policy.py\"",
            "statusMessage": "Checking Bash command"
          }
        ]
      }
    ]
  }
}
```

### Hook Handler Types

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Handler type (`command` is primary) |
| `command` | string | Yes | Shell command to execute |
| `statusMessage` | string | No | Message shown while hook runs |

### Alternative Config: Inline in config.toml

```toml
[hooks]
SessionStart = [
  { matcher = "startup|resume", hooks = [
    { type = "command", command = "python3 ~/.codex/hooks/start.py", statusMessage = "Loading" }
  ]}
]
```

### Plugin-Bundled Hooks

Default location: `hooks/hooks.json` (relative to plugin root)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ${PLUGIN_ROOT}/hooks/session_start.py",
            "statusMessage": "Loading plugin context"
          }
        ]
      }
    ]
  }
}
```

**Environment Variables for Plugin Hooks:**
- `PLUGIN_ROOT` - Points to installed plugin root
- `PLUGIN_DATA` - Points to plugin's writable data directory
- `CLAUDE_PLUGIN_ROOT` / `CLAUDE_PLUGIN_DATA` - Legacy compatibility vars

### MCP Server Configuration (.mcp.json)

```json
{
  "docs": {
    "command": "docs-mcp",
    "args": ["--stdio"]
  }
}
```

Or wrapped format:
```json
{
  "mcp_servers": {
    "docs": {
      "command": "docs-mcp",
      "args": ["--stdio"]
    }
  }
}
```

### App Configuration (.app.json)

Reference to app/connector mappings (format depends on connector type).

---

## 5. File Structure

### Minimal Plugin Structure

```
my-plugin/
├── .codex-plugin/
│   └── plugin.json          # Required: plugin manifest
└── skills/
    └── hello/
        └── SKILL.md          # Skill instructions
```

### Complete Plugin Structure

```
my-plugin/
├── .codex-plugin/
│   └── plugin.json           # Required: plugin manifest
├── skills/
│   └── my-skill/
│       └── SKILL.md          # Optional: skill instructions
├── hooks/
│   └── hooks.json            # Optional: lifecycle hooks
├── .app.json                 # Optional: app/connector mappings
├── .mcp.json                 # Optional: MCP server configuration
└── assets/                   # Optional: icons, logos, screenshots
    ├── icon.png
    ├── logo.png
    └── screenshot-1.png
```

### Important Path Rules
- Only `plugin.json` belongs in `.codex-plugin/`
- Keep `skills/`, `hooks/`, `assets/`, `.mcp.json`, and `.app.json` at plugin root
- All manifest paths must start with `./` and resolve relative to plugin root
- Paths must stay inside the plugin root

### Marketplace Structure

```
# Repo-scoped
$REPO_ROOT/
├── .agents/
│   └── plugins/
│       └── marketplace.json
└── plugins/
    └── my-plugin/
        └── ...

# Personal
~/.agents/
└── plugins/
    └── marketplace.json
```

---

## 6. Constraints & Limitations

### Naming Constraints
- Plugin names normalized to lowercase kebab-case
- Must be <= 64 characters
- Underscores, spaces, punctuation converted to `-`
- Consecutive hyphens collapsed
- Plugin folder name must match `name` field in manifest

### Component Constraints
- `apps` and `mcpServers` should not be in `plugin.json` unless companion files exist
- `hooks` field in manifest is omitted during validation (use `hooks/` directory or `hooks` field with paths)
- Do not include unsupported manifest fields

### Hook Constraints
- **PreToolUse** does not intercept all shell calls (only simple ones)
- **PreToolUse** / **PermissionRequest** only support `systemMessage` output (not `continue`, `stopReason`)
- Hooks run concurrently for the same event - one cannot prevent another
- Non-managed hooks require user trust review before running
- Plugin-bundled hooks are non-managed and must be trusted
- Project-local hooks only load when the project `.codex/` layer is trusted

### Trust & Security
- Codex hashes hook definitions and records trust per-hash
- New/changed hooks are marked for review and skipped until trusted
- Managed hooks (system, MDM, cloud, requirements.toml) cannot be disabled from user browser
- `--dangerously-bypass-hook-trust` flag available for automation (use with caution)

### Marketplace Constraints
- `source.path` must be relative to marketplace root and start with `./`
- Git-backed entries may use `ref` or `sha` selectors
- If Codex can't resolve a marketplace entry, it skips that entry (doesn't fail the whole marketplace)
- Public publishing to official Plugin Directory is "coming soon"

### Installation
- Plugins install to cache at `~/.codex/plugins/cache/`
- Local plugins: version is `local`, loaded from cache
- Each plugin can be enabled/disabled individually
- State stored in `~/.codex/config.toml`

### Environment
- Hooks feature enabled by default
- Can be disabled in `config.toml`:
  ```toml
  [features]
  hooks = false
  ```
- Admins can force hooks off in `requirements.toml`:
  ```toml
  [features]
  hooks = false
  ```

---

## 7. Code Examples

### Minimal Plugin Example

**File structure:**
```
my-first-plugin/
├── .codex-plugin/
│   └── plugin.json
└── skills/
    └── hello/
        └── SKILL.md
```

**`.codex-plugin/plugin.json`:**
```json
{
  "name": "my-first-plugin",
  "version": "1.0.0",
  "description": "Reusable greeting workflow",
  "skills": "./skills/"
}
```

**`skills/hello/SKILL.md`:**
```markdown
---
name: hello
description: Greet the user with a friendly message.
---

Greet the user warmly and ask how you can help.
```

### Plugin with Hooks Example

**`hooks/hooks.json`:**
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ${PLUGIN_ROOT}/hooks/session_start.py",
            "statusMessage": "Loading plugin context"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ${PLUGIN_ROOT}/hooks/policy_check.py",
            "statusMessage": "Running policy check"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ${PLUGIN_ROOT}/hooks/stop_review.py",
            "statusMessage": "Running stop review"
          }
        ]
      }
    ]
  }
}
```

**Python hook handler example (`hooks/session_start.py`):**
```python
#!/usr/bin/env python3
import json
import sys

# Read input from stdin
input_data = json.load(sys.stdin)

# Access common fields
session_id = input_data.get("session_id")
source = input_data.get("source")  # startup, resume, clear, compact
model = input_data.get("model")
cwd = input_data.get("cwd")

# Output additional context as JSON
output = {
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": f"Session {session_id} started from {source}. Working in {cwd}."
    }
}
print(json.dumps(output))
```

**Python PreToolUse policy check (`hooks/policy_check.py`):**
```python
#!/usr/bin/env python3
import json
import sys

input_data = json.load(sys.stdin)

tool_name = input_data.get("tool_name")
tool_input = input_data.get("tool_input")

# Policy: Block rm -rf /
if tool_name == "Bash" and "rm -rf /" in str(tool_input):
    output = {
        "systemMessage": "Policy violation: Deleting root directory is not allowed."
    }
    print(json.dumps(output))
    sys.exit(0)  # Still exits 0; systemMessage is surfaced as warning

# Exit 0 with no output = allow the tool call
sys.exit(0)
```

**Python Stop hook for continuation (`hooks/stop_review.py`):**
```python
#!/usr/bin/env python3
import json
import sys

input_data = json.load(sys.stdin)
last_message = input_data.get("last_assistant_message", "")

# If the response seems incomplete, ask for another pass
if "incomplete" in last_message.lower() or "to be continued" in last_message.lower():
    output = {
        "decision": "block",
        "reason": "The response appears incomplete. Please provide the complete solution."
    }
    print(json.dumps(output))
else:
    # Exit 0 with no output = stop normally
    sys.exit(0)
```

### Marketplace Entry Example

**`~/.agents/plugins/marketplace.json`:**
```json
{
  "name": "personal",
  "interface": {
    "displayName": "My Personal Plugins"
  },
  "plugins": [
    {
      "name": "my-first-plugin",
      "source": {
        "source": "local",
        "path": "./plugins/my-first-plugin"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

### Plugin with MCP Server Example

**`.mcp.json`:**
```json
{
  "docs": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-docs"]
  }
}
```

**Updated `plugin.json`:**
```json
{
  "name": "docs-plugin",
  "version": "1.0.0",
  "description": "Documentation search plugin",
  "skills": "./skills/",
  "mcpServers": "./.mcp.json",
  "interface": {
    "displayName": "Docs Search",
    "category": "Developer Tools"
  }
}
```

---

## Summary

The OpenAI Codex plugin system is a well-structured framework for extending Codex with:

1. **Manifest-driven packaging** via `.codex-plugin/plugin.json`
2. **Skills** (reusable instructions via `SKILL.md` files)
3. **MCP server integrations** (via `.mcp.json`)
4. **App/connector integrations** (via `.app.json`)
5. **Lifecycle hooks** (via `hooks/hooks.json`) with 10 event types
6. **Marketplace distribution** via JSON catalogs

The system is designed for sharing workflows across teams and projects, with a trust model for hook execution and support for both local development and team-wide distribution.
