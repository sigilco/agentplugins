# OpenCode Plugin System - Technical Research Report

**Sources:**
- [OpenCode Official Plugin Docs (EN)](https://opencode.ai/docs/en/plugins/)
- [OpenCode Official Plugin Docs (ZH)](https://opencode.ai/docs/plugins/)
- [GitHub Source: `packages/plugin/src/index.ts`](https://github.com/anomalyco/opencode/blob/dev/packages/plugin/src/index.ts)
- [GitHub Source: `packages/plugin/src/tool.ts`](https://github.com/anomalyco/opencode/blob/dev/packages/plugin/src/tool.ts)
- [GitHub Source: `packages/plugin/src/shell.ts`](https://github.com/anomalyco/opencode/blob/dev/packages/plugin/src/shell.ts)
- [Community Plugin Development Guide Gist](https://gist.github.com/rstacruz/946d02757525c9a0f49b25e316fbe715)

---

## 1. Plugin Manifest / Configuration Format

Plugins are **NOT** configured via a separate manifest file. Instead, they are registered through the main `opencode.json` configuration file.

### Configuration Schema (`opencode.json`)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-helicone-session",
    "opencode-wakatime",
    "@my-org/custom-plugin",
    "file:///path/to/local/plugin/dist/index.js"
  ]
}
```

### Plugin Configuration Type (TypeScript)

```typescript
type Config = Omit<SDKConfig, "plugin"> & {
  plugin?: Array<string | [string, PluginOptions]>
}

type PluginOptions = Record<string, unknown>
```

Plugins can be specified as:
- **String**: npm package name (with optional version/tag: `"my-plugin@1.0.0"`)
- **Tuple**: `[packageName, options]` for passing configuration options to the plugin
- **File URL**: `file:///absolute/path/to/plugin.js` for local development

---

## 2. Hook Types Available

The plugin system uses a **hook-based architecture**. Plugins export a function that returns a `Hooks` object containing hook implementations.

### Complete Hooks Interface

```typescript
interface Hooks {
  // Lifecycle
  dispose?: () => Promise<void>

  // Events
  event?: (input: { event: Event }) => Promise<void>

  // Configuration
  config?: (input: Config) => Promise<void>

  // Custom tools
  tool?: { [key: string]: ToolDefinition }

  // Authentication providers
  auth?: AuthHook

  // Model provider hooks
  provider?: ProviderHook

  // Chat/message hooks
  "chat.message"?: (
    input: {
      sessionID: string
      agent?: string
      model?: { providerID: string; modelID: string }
      messageID?: string
      variant?: string
    },
    output: { message: UserMessage; parts: Part[] }
  ) => Promise<void>

  "chat.params"?: (
    input: {
      sessionID: string
      agent: string
      model: Model
      provider: ProviderContext
      message: UserMessage
    },
    output: {
      temperature: number
      topP: number
      topK: number
      maxOutputTokens: number | undefined
      options: Record<string, any>
    }
  ) => Promise<void>

  "chat.headers"?: (
    input: {
      sessionID: string
      agent: string
      model: Model
      provider: ProviderContext
      message: UserMessage
    },
    output: { headers: Record<string, string> }
  ) => Promise<void>

  // Permission hooks
  "permission.ask"?: (
    input: Permission,
    output: { status: "ask" | "deny" | "allow" }
  ) => Promise<void>

  // Command hooks
  "command.execute.before"?: (
    input: { command: string; sessionID: string; arguments: string },
    output: { parts: Part[] }
  ) => Promise<void>

  // Tool execution hooks
  "tool.execute.before"?: (
    input: { tool: string; sessionID: string; callID: string },
    output: { args: any }
  ) => Promise<void>

  "tool.execute.after"?: (
    input: { tool: string; sessionID: string; callID: string; args: any },
    output: { title: string; output: string; metadata: any }
  ) => Promise<void>

  // Shell environment hooks
  "shell.env"?: (
    input: { cwd: string; sessionID?: string; callID?: string },
    output: { env: Record<string, string> }
  ) => Promise<void>

  // Experimental: Message transformation
  "experimental.chat.messages.transform"?: (
    input: {},
    output: { messages: { info: Message; parts: Part[] }[] }
  ) => Promise<void>

  // Experimental: System prompt transformation
  "experimental.chat.system.transform"?: (
    input: { sessionID?: string; model: Model },
    output: { system: string[] }
  ) => Promise<void>

  // Experimental: Small model selection
  "experimental.provider.small_model"?: (
    input: { provider: ProviderV2 },
    output: { model?: ModelV2 }
  ) => Promise<void>

  // Experimental: Session compaction
  "experimental.session.compacting"?: (
    input: { sessionID: string },
    output: { context: string[]; prompt?: string }
  ) => Promise<void>

  // Experimental: Auto-continue after compaction
  "experimental.compaction.autocontinue"?: (
    input: {
      sessionID: string
      agent: string
      model: Model
      provider: ProviderContext
      message: UserMessage
      overflow: boolean
    },
    output: { enabled: boolean }
  ) => Promise<void>

  // Experimental: Text completion
  "experimental.text.complete"?: (
    input: { sessionID: string; messageID: string; partID: string },
    output: { text: string }
  ) => Promise<void>

  // Tool definition modification
  "tool.definition"?: (
    input: { toolID: string },
    output: { description: string; parameters: any }
  ) => Promise<void>
}
```

### Event Types (for `event` hook)

| Category | Event Name | Description |
|----------|-----------|-------------|
| **Command** | `command.executed` | Command was executed |
| **File** | `file.edited` | File was edited |
| **File** | `file.watcher.updated` | File watcher detected changes (add/change/unlink) |
| **Installation** | `installation.updated` | Installation was updated |
| **LSP** | `lsp.client.diagnostics` | LSP diagnostics available |
| **LSP** | `lsp.updated` | LSP state updated |
| **Message** | `message.part.removed` | Message part removed |
| **Message** | `message.part.updated` | Message part updated |
| **Message** | `message.removed` | Message removed |
| **Message** | `message.updated` | Message updated |
| **Permission** | `permission.asked` | Permission was asked |
| **Permission** | `permission.replied` | Permission response received |
| **Server** | `server.connected` | Server connected |
| **Session** | `session.created` | New session created |
| **Session** | `session.compacted` | Session was compacted |
| **Session** | `session.deleted` | Session deleted |
| **Session** | `session.diff` | Session diff occurred |
| **Session** | `session.error` | Session error occurred |
| **Session** | `session.idle` | Session became idle |
| **Session** | `session.status` | Session status changed |
| **Session** | `session.updated` | Session updated |
| **Todo** | `todo.updated` | Todo list updated |
| **Shell** | `shell.env` | Shell environment event |
| **Tool** | `tool.execute.after` | Tool execution completed |
| **Tool** | `tool.execute.before` | Tool execution starting |
| **TUI** | `tui.prompt.append` | Text appended to TUI prompt |
| **TUI** | `tui.command.execute` | Command executed in TUI |
| **TUI** | `tui.toast.show` | Toast notification shown |

---

## 3. Registration / Loading Mechanism

### Two Loading Methods

#### Method 1: Local Files
Place JavaScript or TypeScript files in plugin directories:

| Scope | Directory |
|-------|-----------|
| Project-level | `.opencode/plugins/` |
| Global | `~/.config/opencode/plugins/` |

Files in these directories are **automatically loaded at startup**.

#### Method 2: npm Packages
Specify npm packages in `opencode.json`:

```json
{
  "plugin": [
    "opencode-helicone-session",
    "opencode-wakatime",
    "@my-org/custom-plugin"
  ]
}
```

npm plugins are installed automatically using **Bun** at startup. Packages and dependencies are cached in `~/.cache/opencode/node_modules/`.

### Load Order

Plugins are loaded from all sources sequentially:

1. Global config (`~/.config/opencode/opencode.json`)
2. Project config (`opencode.json`)
3. Global plugin directory (`~/.config/opencode/plugins/`)
4. Project plugin directory (`.opencode/plugins/`)

**Deduplication**: Duplicate npm packages with the same name and version are loaded once. However, a local plugin and an npm plugin with similar names are both loaded separately.

---

## 4. Plugin File Structure

### Minimal Plugin Structure

```
.opencode/
├── plugins/
│   └── my-plugin.js       # Plugin file (JS or TS)
```

### With Dependencies

```
.opencode/
├── package.json            # For npm dependencies
├── plugins/
│   ├── my-plugin.ts
│   └── another-plugin.js
```

### Published npm Plugin Structure

```
opencode-my-plugin/
├── package.json
├── tsconfig.json
└── src/
    └── index.ts           # Main plugin export
```

### package.json for npm Plugins

```json
{
  "name": "opencode-my-plugin",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": "./dist/index.js",
    "./package.json": "./package.json"
  },
  "peerDependencies": {
    "@opencode-ai/plugin": "*"
  }
}
```

### TypeScript Configuration

```json
{
  "extends": "@tsconfig/node22/tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "module": "preserve",
    "declaration": true,
    "moduleResolution": "bundler"
  },
  "include": ["src"]
}
```

---

## 5. Plugin Context (PluginInput)

Each plugin function receives a `PluginInput` context object:

```typescript
type PluginInput = {
  client: ReturnType<typeof createOpencodeClient>  // OpenCode SDK client
  project: Project                                  // Current project info
  directory: string                                 // Current working directory
  worktree: string                                  // Git worktree path
  experimental_workspace: {
    register(type: string, adapter: WorkspaceAdapter): void
  }
  serverUrl: URL
  $: BunShell                                        // Bun shell for executing commands
}
```

### Context Properties Detail

| Property | Type | Description |
|----------|------|-------------|
| `client` | SDK Client | OpenCode SDK client (connects to localhost:4096) |
| `project` | Project | Project info (id, worktree, vcs) |
| `project.id` | string | Project identifier (git hash or "global") |
| `project.worktree` | string | Git worktree root directory |
| `project.vcs` | string | Version control system ("git" or undefined) |
| `directory` | string | Current working directory |
| `worktree` | string | Git worktree root (alias for project.worktree) |
| `serverUrl` | URL | Server URL |
| `$` | BunShell | Bun's shell API for executing commands |

### BunShell API

```typescript
interface BunShell {
  // Template literal for shell commands
  (strings: TemplateStringsArray, ...expressions: ShellExpression[]): BunShellPromise
  
  // Bash-like brace expansion
  braces(pattern: string): string[]
  
  // Escape strings for shell input
  escape(input: string): string
  
  // Configure environment variables
  env(newEnv?: Record<string, string | undefined>): BunShell
  
  // Configure working directory
  cwd(newCwd?: string): BunShell
  
  // Don't throw on non-zero exit
  nothrow(): BunShell
  
  // Configure throw behavior
  throws(shouldThrow: boolean): BunShell
}
```

---

## 6. Custom Tools API

Plugins can define custom tools that OpenCode can call using the `tool` helper function.

### Tool Definition

```typescript
import { z } from "zod"

export type ToolContext = {
  sessionID: string
  messageID: string
  agent: string
  directory: string        // Current project directory
  worktree: string         // Project worktree root
  abort: AbortSignal
  metadata(input: { title?: string; metadata?: { [key: string]: any } }): void
  ask(input: AskInput): Promise<void>
}

export type ToolAttachment = {
  type: "file"
  mime: string
  url: string
  filename?: string
}

export type ToolResult =
  | string
  | {
      title?: string
      output: string
      metadata?: { [key: string]: any }
      attachments?: ToolAttachment[]
    }

export function tool<Args extends z.ZodRawShape>(input: {
  description: string
  args: Args
  execute(args: z.infer<z.ZodObject<Args>>, context: ToolContext): Promise<ToolResult>
}) {
  return input
}

tool.schema = z  // Exposes Zod for schema definitions
```

### Tool Naming

- Single export in file: Filename becomes the tool name
- Multiple exports: `<filename>_<exportname>` (e.g., `math_add`)

### Tool Schema Types

Available via `tool.schema` (which is the Zod object):

```typescript
// Available schema types:
tool.schema.string()          // String
tool.schema.number()          // Number
tool.schema.boolean()         // Boolean
tool.schema.enum([...])       // Enum
tool.schema.array(...)        // Array
tool.schema.object(...)       // Object

// With modifiers:
tool.schema.string().describe("description")
tool.schema.string().optional()
tool.schema.number().min(1).max(100)
tool.schema.string().url()
tool.schema.string().email()
```

---

## 7. Authentication Provider API

Plugins can define custom authentication providers:

```typescript
type AuthHook = {
  provider: string
  loader?: (
    auth: () => Promise<Auth>,
    provider: Provider
  ) => Promise<Record<string, any>>
  methods: (
    | {
        type: "oauth"
        label: string
        prompts?: Array<...>
        authorize(inputs?: Record<string, string>): Promise<AuthOAuthResult>
      }
    | {
        type: "api"
        label: string
        prompts?: Array<...>
        authorize?(inputs?: Record<string, string>): Promise<...>
      }
  )[]
}
```

---

## 8. Constraints & Limitations

### Technical Constraints

1. **Runtime**: Uses Bun runtime - npm plugins are installed via `bun install`
2. **Language**: JavaScript or TypeScript only
3. **Module format**: ESM (`"type": "module"` recommended)
4. **Local plugin dependencies**: Must create a `package.json` in the config directory
5. **Duplicate plugins**: Same name+version npm packages are deduplicated; local and npm plugins with similar names load separately

### Security Constraints

1. **Tool precedence**: Plugin tools with the same name as built-in tools **take precedence**
2. **Permission system**: Plugins can auto-allow/deny permissions via `permission.ask` hook
3. **Environment access**: Can inject env vars but should not log sensitive data

### Experimental Hooks

Several hooks are marked as `experimental` and may change:
- `experimental.chat.messages.transform`
- `experimental.chat.system.transform`
- `experimental.provider.small_model`
- `experimental.session.compacting`
- `experimental.compaction.autocontinue`
- `experimental.text.complete`

### Known Issues

- `permission.ask` hook exists but may not be called in all versions (see [anomalyco/opencode#7006](https://github.com/anomalyco/opencode/issues/7006))

---

## 9. Minimal Plugin Examples

### Example 1: Bare Minimum Plugin

```javascript
// .opencode/plugins/minimal.js
export const MyPlugin = async ({ project, client, $, directory, worktree }) => {
  console.log("Plugin initialized!")
  console.log("Project:", project.id)
  console.log("Directory:", directory)
  
  return {
    // Hook implementations go here
  }
}
```

### Example 2: Session Notification Plugin

```javascript
// .opencode/plugins/notification.js
export const NotificationPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await $`osascript -e 'display notification "Session completed!" with title "opencode"'`
      }
    },
  }
}
```

### Example 3: Tool Execution Hook (.env Protection)

```javascript
// .opencode/plugins/env-protection.js
export const EnvProtection = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "read" && output.args.filePath.includes(".env")) {
        throw new Error("Do not read .env files")
      }
    },
  }
}
```

### Example 4: Environment Variable Injection

```javascript
// .opencode/plugins/inject-env.js
export const InjectEnvPlugin = async () => {
  return {
    "shell.env": async (input, output) => {
      output.env.MY_API_KEY = "secret"
      output.env.PROJECT_ROOT = input.cwd
    },
  }
}
```

### Example 5: Custom Tool

```typescript
// .opencode/plugins/custom-tools.ts
import { type Plugin, tool } from "@opencode-ai/plugin"

export const CustomToolsPlugin: Plugin = async (ctx) => {
  return {
    tool: {
      mytool: tool({
        description: "This is a custom tool",
        args: {
          foo: tool.schema.string().describe("A foo parameter"),
          count: tool.schema.number().optional().describe("Optional count"),
        },
        async execute(args, context) {
          const { directory, worktree } = context
          return `Hello ${args.foo}! Count: ${args.count || 1} from ${directory}`
        },
      }),
    },
  }
}
```

### Example 6: TypeScript Plugin with Types

```typescript
// .opencode/plugins/typed-plugin.ts
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  console.log("Plugin initialized!")
  
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "bash") {
        // Modify arguments before execution
        output.args.command = output.args.command.replace(/dangerous/g, "safe")
      }
    },
  }
}
```

### Example 7: Structured Logging

```typescript
// .opencode/plugins/logging.ts
export const LoggingPlugin = async ({ client }) => {
  await client.app.log({
    body: {
      service: "my-plugin",
      level: "info",
      message: "Plugin initialized",
      extra: { foo: "bar" },
    },
  })
}
```

Log levels: `debug`, `info`, `warn`, `error`

### Example 8: Session Compaction Hook

```typescript
// .opencode/plugins/compaction.ts
import type { Plugin } from "@opencode-ai/plugin"

export const CompactionPlugin: Plugin = async (ctx) => {
  return {
    "experimental.session.compacting": async (input, output) => {
      // Inject additional context into the compaction prompt
      output.context.push(`
## Custom Context
Include any state that should persist across compaction:
- Current task status
- Important decisions made
- Files being actively worked on
      `)
    },
  }
}
```

### Example 9: Chat Parameters Modification

```typescript
// .opencode/plugins/chat-params.ts
import type { Plugin } from "@opencode-ai/plugin"

export const ChatParamsPlugin: Plugin = async (ctx) => {
  return {
    "chat.params": async (input, output) => {
      // Adjust LLM parameters based on context
      output.temperature = 0.7
      output.options.customParam = "value"
    },
  }
}
```

### Example 10: Permission Auto-Allow

```typescript
// .opencode/plugins/permissions.ts
import type { Plugin } from "@opencode-ai/plugin"

export const PermissionPlugin: Plugin = async (ctx) => {
  return {
    "permission.ask": async (permission, output) => {
      // Auto-allow read_file permissions
      if (permission.type === "read_file") {
        output.status = "allow"
      }
    },
  }
}
```

---

## 10. Dependencies Management

For local plugins requiring external npm packages:

1. Create `package.json` in config directory:

```json
// .opencode/package.json
{
  "dependencies": {
    "shescape": "^2.1.0"
  }
}
```

2. OpenCode runs `bun install` at startup
3. Import in plugin:

```typescript
import { escape } from "shescape"

export const MyPlugin = async (ctx) => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "bash") {
        output.args.command = escape(output.args.command)
      }
    },
  }
}
```

---

## 11. Publishing Checklist

1. **Naming**: Use `opencode-` prefix (e.g., `opencode-my-service`)
2. **Package type**: Set `"type": "module"` in package.json
3. **Peer dependencies**: Add `"@opencode-ai/plugin": "*"` as peer dependency
4. **Build**: Use TypeScript or Bun to build to `dist/`
5. **Exports**: Configure proper exports in package.json
6. **Publish**: `npm publish`
7. **Install**: Users add to `opencode.json` plugin array

---

## 12. Key Type Definitions Summary

```typescript
// Plugin function signature
export type Plugin = (
  input: PluginInput,
  options?: PluginOptions
) => Promise<Hooks>

// Plugin module (for npm packages)
export type PluginModule = {
  id?: string
  server: Plugin
  tui?: never
}

// Tool definition type
export type ToolDefinition = ReturnType<typeof tool>

// Provider context
export type ProviderContext = {
  source: "env" | "config" | "custom" | "api"
  info: Provider
  options: Record<string, any>
}
```

---

*Report generated from OpenCode plugin documentation and source code analysis.*
