---
description: Intercept agent lifecycle events with universal hooks
---

# Hooks

Hooks are the core extensibility primitive. A hook is a named lifecycle event that fires at a specific point in the agent's turn, paired with a handler that runs when the event fires. AgentPlugins defines **19 universal hooks** that compile down to each platform's native equivalent.

## The 19 universal hooks

| Category | Hook | Fires when |
|---|---|---|
| Session | `sessionStart` | A new agent session begins. |
| Session | `sessionEnd` | A session ends. |
| Prompt | `userPromptSubmit` | The user submits a prompt. |
| Prompt | `userPromptExpansion` | A prompt is expanded before sending. |
| Tool | `preToolUse` | Before any tool call (filtered by `matcher`). |
| Tool | `postToolUse` | After a tool call returns successfully. |
| Tool | `postToolUseFailure` | After a tool call throws or exits non-zero. |
| Permission | `permissionRequest` | The agent requests permission for an action. |
| Permission | `permissionDenied` | A permission request is denied. |
| Subagent | `subagentStart` | A subagent is spawned. |
| Subagent | `subagentStop` | A subagent finishes. |
| Context | `preCompact` | Before context compaction runs. |
| Context | `postCompact` | After context compaction completes. |
| Lifecycle | `stop` | The agent stops generating. |
| Lifecycle | `stopFailure` | The agent's stop handler errors. |
| Lifecycle | `notification` | The agent emits a notification. |
| File | `fileChanged` | A file on disk changes. |
| File | `cwdChanged` | The working directory changes. |
| Lifecycle | `setup` | Plugin setup/installation hook. |

::: warning
Not every platform implements every hook. At build time the adapter reports which hooks are unsupported for each target — those hooks are silently ignored on that platform. See the [adapters reference](/reference/adapters) for the coverage matrix.
:::

## Hook shape

Each hook is an object with an optional `matcher` and a required `handler`:

```typescript
{
  matcher?: string
  handler: HookHandler
}
```

## Handler types

There are three handler types. Every platform supports at least one; the build step auto-wraps where needed.

### 1. `command` — shell command

Runs a shell command. Supported by every platform. Paths must be `./`-prefixed or use placeholders.

```typescript
hooks: {
  preToolUse: {
    matcher: 'bash',
    handler: {
      type: 'command',
      command: '${PLUGIN_ROOT}/hooks/pre-tool-use.sh',
      statusMessage: 'Scanning command...',
    },
  },
}
```

| Field | Type | Notes |
|---|---|---|
| `type` | `'command'` | Always the literal `command`. |
| `command` | `string` | Shell command to run. Supports `${PLUGIN_ROOT}`, `${PLUGIN_DATA}`, `${HOME}` placeholders. |
| `statusMessage` | `string` | Optional message shown to the user while the hook runs. |
| `shell` | `'bash' \| 'powershell' \| 'cmd'` | Override the default shell. |

The hook receives context on stdin as JSON. Exit code `0` allows the action, exit code `2` blocks it.

### 2. `http` — POST endpoint

POSTs the hook context to a URL. Supported by Claude and Copilot.

```typescript
hooks: {
  preToolUse: {
    matcher: 'bash',
    handler: {
      type: 'http',
      url: 'https://hooks.example.com/pre-tool-use',
      headers: {
        Authorization: 'Bearer ${PLUGIN_DATA}/token',
      },
    },
  },
}
```

| Field | Type | Notes |
|---|---|---|
| `type` | `'http'` | Always the literal `http`. |
| `url` | `string` (URL) | Endpoint to POST to. |
| `headers` | `Record<string, string>` | Optional HTTP headers. |

The response body determines allow/block semantics, mirroring the command handler.

### 3. `reference` / `inline` — TypeScript function

References a named handler in the plugin's handler module, or inlines a TypeScript function directly. Natively supported by OpenCode and Pi Mono; auto-wrapped as a shell command for other platforms.

```typescript
hooks: {
  preToolUse: {
    matcher: 'bash',
    handler: {
      type: 'inline',
      handler: async (ctx) => {
        const input = JSON.stringify(ctx.toolInput)
        if (input.includes('rm -rf /')) {
          return { block: true, reason: 'Root deletion blocked' }
        }
      },
    },
  },
}
```

Or by namespaced reference:

```typescript
hooks: {
  preToolUse: {
    matcher: 'bash',
    handler: {
      type: 'reference',
      reference: 'my-plugin:guard',
    },
  },
}
```

| Field | Type | Notes |
|---|---|---|
| `type` | `'reference' \| 'inline'` | Handler kind. |
| `reference` | `string` | Namespaced as `{plugin}:{component}`. Required for `reference`. |
| `handler` | `(ctx) => Promise<HookResult>` | Inline function. Required for `inline`. |

## Matchers

The `matcher` field narrows when a hook fires. Without a matcher, the hook fires for every occurrence of the event.

```typescript
hooks: {
  preToolUse: {
    matcher: 'bash',          // fires only for the bash tool
    handler: { /* ... */ },
  },
  postToolUse: {
    matcher: 'edit|write',    // regex-style alternation
    handler: { /* ... */ },
  },
}
```

Matchers are matched against the tool name for tool-related hooks and against the command string for command hooks.

## Worked example: security guard

A plugin that blocks `rm -rf /` regardless of which agent runs it:

```typescript
import { definePlugin } from '@agentplugins/core'

export default definePlugin({
  name: 'security-guard',
  version: '1.0.0',
  description: 'Blocks dangerous shell commands across all agents',

  targets: ['claude', 'codex', 'copilot', 'gemini', 'kimi', 'opencode', 'pimono'],

  hooks: {
    preToolUse: {
      matcher: 'bash',
      handler: {
        type: 'inline',
        handler: async (ctx) => {
          const cmd = JSON.stringify(ctx.toolInput)
          const dangerous = [/rm\s+-rf\s+\//, /:\(\)\s*\{\s*:\|/, /dd\s+if=\/dev\/zero/]

          for (const pattern of dangerous) {
            if (pattern.test(cmd)) {
              return {
                block: true,
                reason: `Blocked: command matched ${pattern}`,
              }
            }
          }
        },
      },
    },

    permissionRequest: {
      handler: {
        type: 'command',
        command: '${PLUGIN_ROOT}/hooks/check-permission.sh',
      },
    },

    sessionStart: {
      handler: {
        type: 'inline',
        handler: async () => ({
          additionalContext: 'Security guard plugin active. Dangerous commands will be blocked.',
        }),
      },
    },
  },
})
```

## Hook context

Every handler receives a context object. The exact shape varies slightly per event, but the common fields are:

```typescript
interface HookContext {
  sessionId: string
  cwd: string
  toolName?: string         // for tool hooks
  toolInput?: unknown       // for tool hooks
  prompt?: string           // for prompt hooks
  agentName?: string        // for subagent hooks
  error?: string            // for onError
}
```

## Hook result

Returning an object lets you influence the agent's behavior:

```typescript
interface HookResult {
  block?: boolean           // stop the action
  reason?: string           // explanation (shown to the agent)
  additionalContext?: string// inject context into the turn
  modifiedInput?: unknown   // rewrite the tool input
}
```

## Next steps

- Read the [manifest reference](/guide/manifest) for the full hook schema.
- Learn [creating plugins](/guide/creating-plugins) end-to-end.
- See the [adapters reference](/reference/adapters) for per-platform hook coverage.
