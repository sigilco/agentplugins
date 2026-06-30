---
description: Define callable tools that agents can invoke
---

# Tools

Tools are callable functions the agent can invoke during a turn. Declare them once in the manifest; AgentPlugins compiles them into each platform's native tool format.

## Declaration

The `tools` array lists tool definitions. Each tool has a name, a description the agent reads, and a parameters schema.

```typescript
import { definePlugin } from '@agentplugins/core'

export default definePlugin({
  name: 'my-tools',
  version: '1.0.0',
  description: 'A bundle of agent-callable tools',

  tools: [
    {
      name: 'lookup-user',
      description: 'Look up a user by ID. Returns name and email.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The user identifier',
          },
          verbose: {
            type: 'boolean',
            description: 'Include extended profile fields',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'create-issue',
      description: 'Create a GitHub issue in the current repo',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Issue title' },
          body: { type: 'string', description: 'Issue body (markdown)' },
          labels: {
            type: 'array',
            items: { type: 'string' },
            description: 'Labels to apply',
          },
        },
        required: ['title'],
      },
    },
  ],
})
```

## Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | `string` | yes | Tool identifier. Namespaced as `{plugin}:{tool}` when installed. |
| `description` | `string` | yes | What the tool does. The agent reads this to decide when to call the tool. |
| `parameters` | JSON Schema | yes | JSON Schema describing the tool input. |

## Parameters schema

`parameters` is a standard [JSON Schema](https://json-schema.org/) object describing the tool's input. The required fields are `type` and `properties`:

```typescript
parameters: {
  type: 'object',
  properties: {
    // ...property definitions
  },
  required: ['fieldName'],
}
```

### Property types

| Type | Example |
|---|---|
| `string` | `{ type: 'string', description: 'A name' }` |
| `number` | `{ type: 'number', description: 'An age' }` |
| `boolean` | `{ type: 'boolean', description: 'Is active' }` |
| `array` | `{ type: 'array', items: { type: 'string' } }` |
| `object` | `{ type: 'object', properties: { /* nested */ } }` |

### Enums

Constrain a property to a fixed set of values:

```typescript
role: {
  type: 'string',
  enum: ['admin', 'member', 'guest'],
  description: 'User role',
}
```

### Nested objects

```typescript
parameters: {
  type: 'object',
  properties: {
    filter: {
      type: 'object',
      properties: {
        field: { type: 'string' },
        op: { type: 'string', enum: ['eq', 'ne', 'gt', 'lt'] },
        value: { type: 'string' },
      },
      required: ['field', 'op'],
    },
  },
  required: ['filter'],
}
```

## Writing descriptions

The agent uses `description` fields to decide when and how to call a tool. Treat them as documentation for a smart but literal reader:

- Be specific about what the tool does: `"Look up a user by ID"` beats `"User lookup"`.
- Document side effects: `"Deletes the file permanently"` is better than `"Removes a file"`.
- Mention units and formats: `"ISO 8601 timestamp"`, `"size in bytes"`.

## Tool handlers

The manifest declares the **shape** of a tool. The implementation — what runs when the agent invokes the tool — is provided by an MCP server or an inline handler referenced from the plugin module. See [MCP servers](/guide/mcp-servers) and [Hooks](/guide/hooks) for handler details.

## Per-platform behavior

`tools[]` is natively emitted by **OpenCode** and **Pi** only. For all other platforms — including Claude Code and Codex — **`mcpServers` is the recommended universal tool delivery mechanism**.

| Platform | `tools[]` | `mcpServers` | Notes |
|---|:---:|:---:|---|
| Claude Code | ⚠️ | ✅ | `tools[]` not emitted; use `mcpServers` |
| Codex | ⚠️ | ✅ | Same as Claude Code |
| OpenCode | ✅ | ✅ | First-class `tools[]` + `mcpServers` both supported |
| Pi | ✅ | ⚠️ | Pi has no built-in MCP. Use first-class `tools[]` (emitted natively) or bridge via `nativeEntry.pimono`. See [MCP on Pi](/guide/porting#mcp-on-pi). |
| Copilot | ⚠️ | ❌ | Neither emitted; Tier-2 only |
| Gemini | ⚠️ | ❌ | Neither emitted; Tier-2 only |
| Kimi | ⚠️ | ❌ | Neither emitted; Tier-2 only |

> ⚠️ When `tools[]` is declared and the target platform does not natively emit it, `agentplugins validate` emits a **WARNING** (not an error) with a pointer to `mcpServers`. The build still succeeds.
>
> ⚠️ Pi has no built-in MCP support. On Pi, the native `tools[]` emission is the recommended path. `agentplugins validate` emits a WARNING when `mcpServers` is set with `pimono` as a target.

### Recommended cross-harness pattern

For plugins targeting Claude, Codex, and OpenCode, back tools with an MCP server. For Pi, declare `tools[]` directly (emitted natively) or use `nativeEntry.pimono` to bridge an MCP server through a Pi extension.

```typescript
export default definePlugin({
  name: 'my-tools',
  version: '1.0.0',

  // MCP path: consumed by Claude Code, Codex, OpenCode (not Pi)
  mcpServers: {
    'my-tools-server': {
      command: 'npx',
      args: ['my-tools-mcp-server'],
    },
  },

  // Optional: declare tool shapes for OpenCode/Pi native emission
  tools: [
    {
      name: 'lookup-user',
      description: 'Look up a user by ID. Returns name and email.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The user identifier' },
        },
        required: ['id'],
      },
    },
  ],
})
```

See the [Capability Matrix](/guide/capability-matrix) for full cross-harness tool support details.

## Next steps

- [MCP Servers](/guide/mcp-servers) — recommended universal tool mechanism for all supported harnesses.
- [Manifest reference](/guide/manifest) for the full `tools` schema.
- [Capability Matrix](/guide/capability-matrix) for cross-harness support details.
