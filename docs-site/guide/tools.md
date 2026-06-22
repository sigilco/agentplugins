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

| Platform | Tool support | Notes |
|---|---|---|
| Claude | ✓ | Emits native tool definitions. |
| Codex | ✓ | Emits native tool definitions. |
| Copilot | ✓ | Emits native tool definitions. |
| Gemini | ✓ | Emits native tool definitions. |
| Kimi | ✓ | Emits native tool definitions. |
| OpenCode | ✓ | Emits native tool definitions. |
| Pi Mono | ✓ | Emits native tool definitions. |

## Next steps

- [Manifest reference](/guide/manifest) for the full `tools` schema.
- [MCP servers](/guide/mcp-servers) for backing tools with MCP servers.
- [JSON Schema](/reference/schema) for validating tool definitions.
