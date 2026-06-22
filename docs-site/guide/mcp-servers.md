---
description: Configure MCP (Model Context Protocol) servers once, deploy to all harnesses
---

# MCP Servers

[MCP](https://modelcontextprotocol.io/) (Model Context Protocol) servers extend an agent with external tools and data sources. Declare them once in the manifest and AgentPlugins wires them into every supported harness.

## Declaration

MCP servers are keyed by name under `mcpServers`:

```typescript
import { definePlugin } from '@agentplugins/core'

export default definePlugin({
  name: 'my-plugin',
  version: '1.0.0',
  description: 'Wires MCP servers into every agent',

  mcpServers: {
    filesystem: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '${HOME}/projects'],
      env: {
        NODE_ENV: 'production',
      },
    },
    github: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: {
        GITHUB_TOKEN: '${PLUGIN_DATA}/github-token',
      },
    },
  },
})
```

## Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `command` | `string` | yes | Executable to run. |
| `args` | `string[]` | no | Arguments passed to the command. |
| `env` | `Record<string, string>` | no | Environment variables. |
| `transport` | `'stdio' \| 'http'` | no | Transport mode. Defaults to `stdio`. |

## Placeholders

Commands, arguments, and environment values support placeholder expansion:

| Placeholder | Resolves to |
|---|---|
| `${PLUGIN_ROOT}` | The plugin's directory in the universal store. |
| `${PLUGIN_DATA}` | Per-plugin data directory (`~/.agents/plugins/<name>/data`). |
| `${HOME}` | User home directory. |

Use `${PLUGIN_DATA}` for secrets and per-install state — that directory is never overwritten on plugin update.

::: warning
Never hard-code secrets into the manifest. Commit a reference to `${PLUGIN_DATA}` and have a `setup` hook write the actual value on first run. The [linting](/guide/linting) rule `secrets` catches common leak patterns.
:::

## Transport modes

### `stdio` (default)

The agent spawns the MCP server as a subprocess and communicates over stdin/stdout. This is the universal default — every supported agent implements it.

```typescript
mcpServers: {
  myServer: {
    command: '${PLUGIN_ROOT}/bin/my-server',
    args: ['--stdio'],
    transport: 'stdio',
  },
}
```

### `http`

The agent connects to a long-running MCP server over HTTP. Supported by Claude and Copilot; other platforms fall back to `stdio`.

```typescript
mcpServers: {
  remote: {
    command: '${PLUGIN_ROOT}/bin/my-server',
    args: ['--port', '3000'],
    transport: 'http',
  },
}
```

## Per-platform behavior

| Platform | stdio | http | Notes |
|---|---|---|---|
| Claude | ✓ | ✓ | Native MCP support. |
| Codex | ✓ | — | stdio only. |
| Copilot | ✓ | ✓ | Native MCP support. |
| Gemini | ✓ | — | stdio only. |
| Kimi | ✓ | — | stdio only. |
| OpenCode | ✓ | ✓ | Native MCP support. |
| Pi Mono | ✓ | — | stdio only. |

Unsupported transports are dropped at build time with a warning.

## Next steps

- [Manifest reference](/guide/manifest) for the full `mcpServers` schema.
- [Linting](/guide/linting) to catch leaked secrets before publish.
- [Adapters reference](/reference/adapters) for per-platform MCP support.
