---
description: Define your plugin with the AgentPlugins universal manifest format
---

# Manifest

Every plugin is described by a single manifest file: `agentplugins.config.ts` at the plugin root. The manifest is the universal contract — adapters compile it into each platform's native format at build time.

```typescript
import { definePlugin } from '@agentplugins/core'

export default definePlugin({
  // ...fields
})
```

Use `definePlugin` for editor autocomplete and compile-time validation. You can also author the manifest as static JSON (`agentplugins.json`) — both forms are supported.

::: tip
Add `"$schema": "__DOCS_SITE__/schema/v1.json"` to JSON manifests for editor autocomplete in VS Code, JetBrains, and any JSON-Schema-aware editor. See the [JSON Schema reference](/reference/schema).
:::

## Required fields

| Field | Type | Rule |
|---|---|---|
| `name` | `string` | Kebab-case (`^[a-z][a-z0-9-]*$`), max 64 chars. MUST NOT be prefixed with `agentplugin`. |
| `version` | `string` | Semantic version ([semver](https://semver.org/)). |
| `description` | `string` | Short human-readable description, minimum 10 characters. |

## Metadata fields

| Field | Type | Notes |
|---|---|---|
| `displayName` | `string` | Human-readable name shown in UIs. |
| `author` | `string \| { name, email?, url? }` | Author or organization. |
| `homepage` | `string` (URL) | Landing page. |
| `repository` | `string` (URL) | Source repository. |
| `license` | `string` | SPDX identifier (e.g. `MIT`, `Apache-2.0`). |
| `keywords` | `string[]` | Discovery tags. |

## Targets

`targets` restricts which platforms the plugin compiles for. Omit it to target every supported platform.

```typescript
targets: ['claude', 'codex', 'copilot', 'gemini', 'kimi', 'opencode', 'pimono']
```

See the [adapters reference](/reference/adapters) for what each target emits.

## Hooks

The `hooks` object maps universal lifecycle event names to handlers. There are **19 universal hook names** covering the entire agent lifecycle:

| Category | Hooks |
|---|---|
| Session | `sessionStart`, `sessionEnd`, `setup` |
| Prompt | `userPromptSubmit`, `userPromptExpansion` |
| Tool | `preToolUse`, `postToolUse`, `postToolUseFailure` |
| Permission | `permissionRequest`, `permissionDenied` |
| Subagent | `subagentStart`, `subagentStop` |
| Context | `preCompact`, `postCompact` |
| Lifecycle | `stop`, `stopFailure`, `notification` |
| File | `fileChanged`, `cwdChanged` |

```typescript
hooks: {
  preToolUse: {
    matcher: 'bash',
    handler: { /* ... */ },
  },
  sessionStart: {
    handler: { /* ... */ },
  },
}
```

See the [Hooks guide](/guide/hooks) for handler types, matchers, and worked examples.

## Skills

An array of [SKILL.md](/guide/skills)-compatible skill definitions. Each skill is namespaced as `{plugin}:{skill}` when installed.

```typescript
skills: [
  {
    name: 'security-guard',
    description: 'Security policy enforcement',
    path: './skills/security-guard/SKILL.md',
    tags: ['security', 'safety'],
  },
],
```

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | Skill identifier. |
| `description` | `string` | Short description shown to the agent. |
| `path` | `string` | Relative path to the `SKILL.md` body (or use `content` inline). |
| `tags` | `string[]` | Optional discovery tags. |

## MCP servers

The `mcpServers` object declares [Model Context Protocol](https://modelcontextprotocol.io/) servers to start. Keys are server names.

```typescript
mcpServers: {
  filesystem: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '${HOME}/projects'],
    env: {
      NODE_ENV: 'production',
    },
  },
},
```

| Field | Type | Notes |
|---|---|---|
| `command` | `string` | Executable to run. Required. |
| `args` | `string[]` | Arguments passed to the command. |
| `env` | `Record<string, string>` | Environment variables. |

See [MCP Servers](/guide/mcp-servers) for transport options and placeholders.

## Tools

The `tools` array declares tools the agent can call. Parameters follow JSON Schema.

```typescript
tools: [
  {
    name: 'lookup-user',
    description: 'Look up a user by ID',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'User identifier' },
      },
      required: ['id'],
    },
  },
],
```

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | Tool identifier. |
| `description` | `string` | What the tool does. The agent reads this. |
| `parameters` | JSON Schema | JSON Schema describing the tool input. |

See [Tools](/guide/tools) for the full parameter schema.

## Commands

The `commands` array declares slash commands the agent can invoke. Each command maps to a handler.

```typescript
commands: [
  {
    name: 'format',
    description: 'Format the current file',
    handler: {
      type: 'command',
      command: '${PLUGIN_ROOT}/scripts/format.sh',
    },
  },
],
```

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | Command name (without leading `/`). |
| `description` | `string` | Short help text. |
| `handler` | `HookHandler` | Same handler types as hooks. |

## Agents

The `agents` array declares subagents the plugin provides. Each subagent has its own prompt and tool allow-list.

```typescript
agents: [
  {
    name: 'reviewer',
    description: 'Reviews code changes',
    tools: ['read', 'diff'],
  },
],
```

## Rules

The `rules` array declares behavioral rules — allow/deny/warn patterns applied to tool calls.

```typescript
rules: [
  {
    name: 'no-root-rm',
    description: 'Block recursive root deletion',
    pattern: 'rm\\s+-rf\\s+/',
    action: 'deny',
  },
],
```

## LSP servers

The `lspServers` array declares Language Server Protocol servers to attach.

```typescript
lspServers: [
  {
    name: 'eslint',
    command: 'vscode-eslint-language-server',
    args: ['--stdio'],
    languages: ['javascript', 'typescript'],
  },
],
```

## Complete example

```typescript
import { definePlugin } from '@agentplugins/core'

export default definePlugin({
  name: 'my-security-guard',
  version: '1.0.0',
  description: 'Blocks dangerous commands across all agents',

  displayName: 'Security Guard',
  author: { name: 'Jane Doe', url: 'https://janedoe.dev' },
  homepage: 'https://github.com/user/my-security-guard',
  repository: 'https://github.com/user/my-security-guard',
  license: 'Apache-2.0',
  keywords: ['security', 'safety', 'guard'],

  targets: ['claude', 'codex', 'copilot', 'gemini', 'kimi', 'opencode', 'pimono'],

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
        type: 'command',
        command: '${PLUGIN_ROOT}/hooks/session-start.sh',
      },
    },
    userPromptSubmit: {
      handler: {
        type: 'reference',
        reference: 'my-security-guard:prompt-guard',
      },
    },
  },

  skills: [
    {
      name: 'security-guard',
      description: 'Security policy enforcement',
      path: './skills/security-guard/SKILL.md',
      tags: ['security', 'safety'],
    },
  ],

  mcpServers: {
    vault: {
      command: '${PLUGIN_ROOT}/bin/vault-mcp',
      args: ['--stdio'],
      env: { VAULT_ADDR: 'https://vault.example.com' },
    },
  },

  tools: [
    {
      name: 'scan-secret',
      description: 'Scan a file for committed secrets',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File to scan' },
        },
        required: ['path'],
      },
    },
  ],

  commands: [
    {
      name: 'audit',
      description: 'Run a full security audit on the workspace',
      handler: {
        type: 'command',
        command: '${PLUGIN_ROOT}/scripts/audit.sh',
      },
    },
  ],

  agents: [
    {
      name: 'auditor',
      description: 'Dedicated security auditor subagent',
      tools: ['read', 'scan-secret'],
    },
  ],

  rules: [
    {
      name: 'no-root-rm',
      pattern: 'rm\\s+-rf\\s+/',
      action: 'deny',
    },
  ],
})
```

## Next steps

- [Hooks](/guide/hooks) — the 19 lifecycle events in depth.
- [Creating plugins](/guide/creating-plugins) — scaffold and build a real plugin.
- [JSON Schema](/reference/schema) — validate manifests programmatically.
