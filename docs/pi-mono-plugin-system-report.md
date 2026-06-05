# Pi Mono Plugin/Extension System - Technical Research Report

## Overview

**Pi Mono** (also known as "Pi" or "pi-mono") is a monorepo for building AI coding agents, created by Mario Zechner (badlogicgames). Its extension system is a **TypeScript-based plugin architecture** that allows developers to hook into every aspect of the agent's lifecycle. Unlike traditional plugin systems with JSON manifests, Pi Mono extensions are **TypeScript modules** that export a default factory function receiving an `ExtensionAPI` object.

**Key Repositories:**
- Main repo: `earendil-works/pi` (formerly `badlogic/pi-mono`)
- NPM scope: `@earendil-works/pi-coding-agent` (formerly `@mariozechner/pi-coding-agent`)
- Website: https://pi.dev

---

## 1. Plugin Manifest Format

### For Packages (Distributed Extensions)

Pi Mono packages use **`package.json`** with a `pi` key section:

```json
{
  "name": "my-pi-extension",
  "version": "1.0.0",
  "type": "module",
  "pi": {
    "extensions": ["./src/index.ts"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  },
  "dependencies": {
    "zod": "^3.0.0",
    "chalk": "^5.0.0"
  }
}
```

### Required Fields in `package.json`

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Package name |
| `pi.extensions` | Yes (for extensions) | Array of entry point paths |
| `pi.skills` | No | Paths to skill definitions |
| `pi.prompts` | No | Paths to prompt templates |
| `pi.themes` | No | Paths to theme files |
| `dependencies` | No | Runtime npm dependencies |
| `type: "module"` | Recommended | ES module support |

### Per-Project Settings (`settings.json`)

```json
{
  "packages": [
    "npm:@foo/bar@1.0.0",
    "git:github.com/user/repo@v1"
  ],
  "extensions": [
    "/path/to/local/extension.ts",
    "/path/to/local/extension/dir"
  ]
}
```

### For Local Extensions (No package.json needed)

Single-file extensions require **no manifest** - they are auto-discovered by file location (see Registration Mechanism below).

---

## 2. Hook Types Available

### Event System (`pi.on(event, handler)`)

Pi Mono provides a comprehensive event-driven hook system:

#### **Session Lifecycle Events**

| Event | Fired When | Can Cancel? | Return Values |
|-------|-----------|-------------|---------------|
| `session_start` | New session starts (startup, new, resume, fork) | No | None |
| `session_shutdown` | Session ending (quit, reload, new, resume, fork) | No | None |
| `resources_discover` | After session_start, resources loaded | No | None |
| `session_before_switch` | Before `/new` or `/resume` | **Yes** (`{ cancel: true }`) | None |
| `session_before_fork` | Before `/fork` or `/clone` | **Yes** (`{ cancel: true }`) | None |
| `session_before_compact` | Before `/compact` or auto-compaction | **Yes** or custom compaction | `{ cancel: true }` or `{ summary, firstKeptEntryId, tokensBefore }` |
| `session_compact` | After compaction completes | No | None |
| `session_before_tree` | Before `/tree` navigation | **Yes** or custom | `{ cancel: true }` or `{ summary }` |
| `session_tree` | After tree navigation | No | None |

#### **Agent Lifecycle Events**

| Event | Fired When | Can Cancel? | Return Values |
|-------|-----------|-------------|---------------|
| `before_agent_start` | After user prompt, before agent loop | No | `{ message, systemPrompt }` (inject) |
| `agent_start` | Agent loop begins | No | None |
| `agent_end` | Agent loop ends | No | `{ messages }` |
| `turn_start` | Each LLM turn begins | No | None |
| `turn_end` | Each LLM turn ends | No | None |

#### **Context/Provider Events**

| Event | Fired When | Can Cancel? | Return Values |
|-------|-----------|-------------|---------------|
| `input` | User input submitted | **Yes** (handle) or transform | `{ handled: true }` or `{ prompt, images }` |
| `context` | Before LLM sees messages | No | `{ messages }` (mutate) |
| `before_provider_request` | Before HTTP request to LLM | No | `{ body }` (mutate payload) |
| `after_provider_response` | After HTTP response, before stream | No | Inspect headers/status |

#### **Message Events**

| Event | Fired When | Can Cancel? | Return Values |
|-------|-----------|-------------|---------------|
| `message_start` | LLM begins responding | No | None |
| `message_update` | Each token/stream chunk | No | None |
| `message_end` | LLM finishes responding | No | None |

#### **Tool Events**

| Event | Fired When | Can Cancel/Modify? | Return Values |
|-------|-----------|-------------------|---------------|
| `tool_execution_start` | Tool execution begins | No | None |
| `tool_call` | Before tool executes | **Block** | `{ block: true, reason?: string }` |
| `tool_execution_update` | Tool streams progress | No | None |
| `tool_result` | After tool execution | **Modify** result | `{ content, details, isError }` (partial) |
| `tool_execution_end` | Tool execution complete | No | None |

#### **Model Events**

| Event | Fired When | Can Cancel? | Return Values |
|-------|-----------|-------------|---------------|
| `model_select` | Model changes | No | None |
| `thinking_level_select` | Thinking level changes | No | None |

#### **User Command Events**

| Event | Fired When | Can Cancel? | Return Values |
|-------|-----------|-------------|---------------|
| `user_bash` | User types `!command` | **Yes** (handle) | `{ handled: true }` |

---

## 3. Registration Mechanism

### Auto-Discovery (File-Based Loading)

Extensions are **auto-discovered** from these locations (no explicit registration needed):

| Location | Scope | Pattern |
|----------|-------|---------|
| `~/.pi/agent/extensions/*.ts` | Global (all projects) | Single file |
| `~/.pi/agent/extensions/*/index.ts` | Global (subdirectory) | Directory with index.ts |
| `.pi/extensions/*.ts` | Project-local | Single file |
| `.pi/extensions/*/index.ts` | Project-local (subdirectory) | Directory with index.ts |

### Manual Loading

```bash
# Quick test (temporary, one-run only)
pi -e ./my-extension.ts
pi --extension ./my-extension.ts

# Install from npm
cd ~/.pi/agent/extensions/
npm install my-pi-extension

# Install via pi CLI
pi install npm:@foo/bar
pi install git:github.com/user/repo
pi install /absolute/path/to/package
pi install ./relative/path/to/package
```

### Loading Mechanism

1. Extensions are loaded via **`jiti`** - a TypeScript loader that requires **no build step**
2. The default exported factory function receives `ExtensionAPI`
3. If the factory returns a `Promise`, Pi awaits it before continuing startup
4. Extensions loaded via `-e` are temporary (one session only)
5. Extensions in auto-discovered locations can be **hot-reloaded** with `/reload`

### Extension Factory Signature

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Synchronous factory
export default function (pi: ExtensionAPI): void {
  // Register hooks, tools, commands
}

// Async factory
export default async function (pi: ExtensionAPI): Promise<void> {
  const config = await fetchRemoteConfig();
  pi.registerProvider("custom", config);
}
```

---

## 4. Configuration Schema

### `settings.json` Schema

```typescript
interface PiSettings {
  /** Installed packages (npm, git, or local paths) */
  packages?: string[];
  
  /** Local extension paths */
  extensions?: string[];
  
  /** Default model provider */
  provider?: string;
  
  /** Default model ID */
  model?: string;
  
  /** Thinking level */
  thinkingLevel?: "off" | "low" | "medium" | "high";
  
  /** Keybindings configuration */
  keybindings?: Record<string, string>;
  
  /** Theme */
  theme?: string;
  
  /** Custom system prompt */
  systemPrompt?: string;
  
  /** Shell aliases */
  shellAliases?: Record<string, string>;
}
```

### Package `package.json` Schema

```typescript
interface PiPackageManifest {
  name: string;
  version: string;
  type?: "module";
  pi?: {
    extensions?: string[];   // Entry point paths
    skills?: string[];       // Skill directory paths
    prompts?: string[];      // Prompt template paths
    themes?: string[];       // Theme file paths
  };
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}
```

### Model Provider Registration Schema

```typescript
interface ProviderConfig {
  name?: string;
  baseUrl: string;
  apiKey?: string;           // Supports $ENV_VAR, ${ENV_VAR}, !command
  api: "anthropic-messages" | "openai-completions" | "openai-responses" | string;
  headers?: Record<string, string>;
  authHeader?: boolean;
  models: ModelDefinition[];
  oauth?: OAuthConfig;
  streamSimple?: Function;
}

interface ModelDefinition {
  id: string;
  name?: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
  baseUrl?: string;
}
```

---

## 5. File Structure Expected

### Single-File Extension (Minimal)

```
~/.pi/agent/extensions/
└── my-extension.ts          # Single file, exports default function
```

### Directory with `index.ts`

```
~/.pi/agent/extensions/
└── my-extension/
    ├── index.ts             # Entry point (exports default function)
    ├── tools.ts             # Helper modules
    └── utils.ts             # Helper modules
```

### Package with Dependencies

```
~/.pi/agent/extensions/
└── my-extension/
    ├── package.json         # Declares dependencies and entry points
    ├── package-lock.json
    ├── node_modules/        # After npm install
    └── src/
        └── index.ts         # Main entry
```

### Distributed Pi Package (Full Structure)

```
my-pi-package/
├── package.json             # With "pi" key
├── src/
│   └── index.ts             # Extension entry point
├── skills/                  # Skill definitions
│   └── my-skill.md
├── prompts/                 # Prompt templates
│   └── my-prompt.md
└── themes/                  # Theme files
    └── my-theme.json
```

---

## 6. Constraints and Limitations

### Security Constraints

| Constraint | Description |
|-----------|-------------|
| **Full system access** | Extensions run with the user's full system permissions and can execute arbitrary code |
| **Trusted sources only** | The documentation repeatedly warns to only install from trusted sources |
| **No sandboxing** | By default, extensions are not sandboxed (though sandbox extensions exist) |

### Technical Constraints

| Constraint | Description |
|-----------|-------------|
| **Node.js 20+ required** | Minimum Node.js version 20.0.0 |
| **TypeScript only** | Extensions must be written in TypeScript (loaded via `jiti`) |
| **No JSON manifest for single-file** | Simple extensions need no manifest - discovered by path |
| **Hot reload** | Extensions in auto-discover paths support `/reload` hot reloading |
| **Bash shell required** | Built-in tools require bash (Git Bash on Windows) |
| **One extension per file** | Each `.ts` file exports one default factory function |

### Behavior Limitations

| Limitation | Description |
|-----------|-------------|
| **Commands cannot call `ctx.reload()`** | Tools use `ExtensionContext` which lacks `reload()`. Use a command wrapper. |
| **Stale references after session replacement** | Captured `pi`/`ctx` objects are stale after `newSession()`. Use the new `ctx` from `withSession`. |
| **No re-validation after `tool_call` mutation** | Mutating `event.input` skips schema re-validation |
| **Parallel tool execution** | Sibling tool calls are preflighted sequentially, then executed concurrently |
| **Override warnings** | Overriding built-in tools displays a warning in interactive mode |

---

## 7. Code Examples

### Minimal Extension (Hello Tool)

```typescript
/**
 * Hello Tool - Minimal custom tool example
 */
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const helloTool = defineTool({
  name: "hello",
  label: "Hello",
  description: "A simple greeting tool",
  parameters: Type.Object({
    name: Type.String({ description: "Name to greet" }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    return {
      content: [{ type: "text", text: `Hello, ${params.name}!` }],
      details: { greeted: params.name },
    };
  },
});

export default function (pi: ExtensionAPI) {
  pi.registerTool(helloTool);
}
```

### Extension with Events, Commands, and Permission Gating

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  // --- Session lifecycle ---
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("Extension loaded!", "info");
  });

  pi.on("session_shutdown", async (event, ctx) => {
    console.log(`Shutting down: ${event.reason}`);
  });

  // --- Permission gating ---
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && event.input.command?.includes("rm -rf")) {
      const ok = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?");
      if (!ok) return { block: true, reason: "Blocked by user" };
    }
  });

  // --- Custom tool ---
  pi.registerTool({
    name: "greet",
    label: "Greet",
    description: "Greet someone by name",
    parameters: Type.Object({
      name: Type.String({ description: "Name to greet" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return {
        content: [{ type: "text", text: `Hello, ${params.name}!` }],
        details: {},
      };
    },
  });

  // --- Custom command ---
  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Hello ${args || "world"}!`, "info");
    },
  });

  // --- Custom shortcut ---
  pi.registerShortcut("ctrl+shift+p", {
    description: "Toggle plan mode",
    handler: async (ctx) => {
      ctx.ui.notify("Toggled!", "info");
    },
  });

  // --- Custom flag ---
  pi.registerFlag("plan", {
    description: "Start in plan mode",
    type: "boolean",
    default: false,
  });
}
```

### Async Factory with Provider Registration

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default async function (pi: ExtensionAPI) {
  const response = await fetch("http://localhost:1234/v1/models");
  const payload = (await response.json()) as {
    data: Array<{
      id: string;
      name?: string;
      context_window?: number;
      max_tokens?: number;
    }>;
  };

  pi.registerProvider("local-openai", {
    baseUrl: "http://localhost:1234/v1",
    apiKey: "$LOCAL_OPENAI_API_KEY",
    api: "openai-completions",
    models: payload.data.map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: model.context_window ?? 128000,
      maxTokens: model.max_tokens ?? 4096,
    })),
  });
}
```

### Extension with Custom UI Widgets and State Persistence

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  let items: string[] = [];

  // Restore state from session on startup
  pi.on("session_start", async (_event, ctx) => {
    items = [];
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "message" && entry.message.role === "toolResult") {
        if (entry.message.toolName === "todo") {
          items = entry.message.details?.items ?? [];
        }
      }
    }
  });

  // Register a stateful tool
  pi.registerTool({
    name: "todo",
    label: "Todo List",
    description: "Manage a todo list",
    parameters: Type.Object({
      action: Type.String({ description: "add, list, or clear" }),
      item: Type.Optional(Type.String({ description: "Item to add" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (params.action === "add" && params.item) {
        items.push(params.item);
      }
      return {
        content: [{ type: "text", text: `Todo list (${items.length} items)` }],
        details: { items: [...items] },  // Persist in session
      };
    },
  });

  // Status widget
  pi.on("agent_start", async (_event, ctx) => {
    ctx.ui.setStatus("todo-ext", `Todos: ${items.length}`);
  });
}
```

### Package `package.json` Example

```json
{
  "name": "pi-extension-my-extension",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "pi": {
    "extensions": ["./index.ts"]
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*"
  },
  "peerDependenciesMeta": {
    "@earendil-works/pi-coding-agent": {
      "optional": true
    }
  }
}
```

---

## 8. ExtensionAPI Method Reference

### Core Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `pi.on()` | `pi.on(event, handler)` | Subscribe to lifecycle events |
| `pi.registerTool()` | `pi.registerTool(definition)` | Register a custom LLM-callable tool |
| `pi.registerCommand()` | `pi.registerCommand(name, options)` | Register a `/command` |
| `pi.registerShortcut()` | `pi.registerShortcut(key, options)` | Register a keyboard shortcut |
| `pi.registerFlag()` | `pi.registerFlag(name, options)` | Register a CLI flag |
| `pi.registerProvider()` | `pi.registerProvider(name, config)` | Register a model provider |
| `pi.unregisterProvider()` | `pi.unregisterProvider(name)` | Remove a registered provider |
| `pi.registerMessageRenderer()` | `pi.registerMessageRenderer(type, renderer)` | Custom message rendering |

### State/Communication Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `pi.sendMessage()` | `pi.sendMessage(message, options?)` | Inject custom message into session |
| `pi.sendUserMessage()` | `pi.sendUserMessage(content, options?)` | Send user message to agent |
| `pi.appendEntry()` | `pi.appendEntry(customType, data?)` | Persist extension state |
| `pi.setSessionName()` | `pi.setSessionName(name)` | Set session display name |
| `pi.getSessionName()` | `pi.getSessionName()` | Get current session name |
| `pi.setLabel()` | `pi.setLabel(entryId, label?)` | Bookmark an entry |
| `pi.exec()` | `pi.exec(command, args?, options?)` | Execute shell command |

### Tool Management Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `pi.getActiveTools()` | `pi.getActiveTools()` | Get currently active tools |
| `pi.getAllTools()` | `pi.getAllTools()` | Get all available tools |
| `pi.setActiveTools()` | `pi.setActiveTools(names)` | Enable/disable tools |

### Query Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `pi.getCommands()` | `pi.getCommands()` | Get available slash commands |
| `pi.getFlag()` | `pi.getFlag(name)` | Read a flag's value |

---

## 9. ExtensionContext (`ctx`) Reference

### Properties and Methods Available in Event Handlers

| Property/Method | Description |
|----------------|-------------|
| `ctx.ui.notify(msg, level)` | Show notification (`"info"`, `"warning"`, `"error"`) |
| `ctx.ui.confirm(title, message, options?)` | Show confirmation dialog |
| `ctx.ui.select(title, items, options?)` | Show selection dialog |
| `ctx.ui.input(title, options?)` | Show text input dialog |
| `ctx.ui.setStatus(key, text?)` | Set footer status line |
| `ctx.ui.setWidget(key, content, options?)` | Set widget above/below editor |
| `ctx.ui.setFooter(factory?)` | Replace footer entirely |
| `ctx.ui.setHeader(factory?)` | Set custom header |
| `ctx.ui.setWorkingMessage(text?)` | Set working/loading message |
| `ctx.ui.setWorkingIndicator(config?)` | Customize working spinner |
| `ctx.ui.setEditorComponent(factory?)` | Replace editor component |
| `ctx.ui.getEditorComponent()` | Get current editor factory |
| `ctx.ui.setEditorText(text)` | Prefill editor text |
| `ctx.ui.getEditorText()` | Get current editor text |
| `ctx.ui.pasteToEditor(text)` | Paste into editor |
| `ctx.ui.addAutocompleteProvider(provider)` | Add autocomplete behavior |
| `ctx.ui.setTitle(title)` | Set terminal title |
| `ctx.ui.theme` | Access theme colors/styles |
| `ctx.ui.custom(factory, options?)` | Render custom TUI component |
| `ctx.sessionManager` | Access session data/entries |
| `ctx.signal` | Current abort signal (for cancel-aware ops) |
| `ctx.isIdle()` | Check if agent is idle |
| `ctx.abort()` | Abort current agent turn |
| `ctx.hasPendingMessages()` | Check for pending messages |
| `ctx.shutdown()` | Request graceful shutdown |
| `ctx.getContextUsage()` | Get current context token usage |
| `ctx.compact(options?)` | Trigger compaction |
| `ctx.getSystemPrompt()` | Get current system prompt string |

### ExtensionCommandContext (commands only)

| Method | Description |
|--------|-------------|
| `ctx.newSession(options?)` | Create/switch to new session |
| `ctx.switchSession(file, options?)` | Switch to existing session |
| `ctx.reload()` | Reload extensions/resources |
| `ctx.getSystemPromptOptions()` | Get structured system prompt options |

---

## 10. TypeBox Schema for Tool Parameters

Pi Mono uses **TypeBox** (via `@sinclair/typebox` or `@earendil-works/pi-ai`) for JSON Schema generation:

```typescript
import { Type } from "@earendil-works/pi-ai";
import { StringEnum } from "@earendil-works/pi-ai";

Type.Object({
  name: Type.String({ description: "Name to greet" }),
  age: Type.Optional(Type.Number({ description: "Age in years" })),
  action: StringEnum(["list", "add", "remove"] as const),
  tags: Type.Array(Type.String()),
  nested: Type.Object({
    field: Type.Boolean(),
  }),
});
```

### Tool Definition Interface

```typescript
interface ToolDefinition<TParams = unknown> {
  name: string;                    // Unique tool name
  label: string;                   // Display label
  description: string;             // LLM-visible description
  parameters: TParams;             // TypeBox schema
  promptSnippet?: string;          // One-line tool summary for system prompt
  promptGuidelines?: string[];     // Tool-specific guidelines
  prepareArguments?: (args: unknown) => unknown;  // Pre-validation transform
  execute: (
    toolCallId: string,
    params: Static<TParams>,
    signal: AbortSignal | undefined,
    onUpdate: ((result: Partial<ToolResult>) => void) | undefined,
    ctx: ExtensionContext
  ) => Promise<ToolResult>;
  renderCall?: (args, theme, context) => Component;    // Custom call rendering
  renderResult?: (result, options, theme, context) => Component;  // Custom result rendering
}

interface ToolResult {
  content: Array<{ type: "text"; text: string } | { type: "image"; ... }>;
  details: Record<string, unknown>;  // Persisted in session
  isError?: boolean;
}
```

---

## Sources

1. **Official Extension Documentation**: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md (2627 lines, 97.5 KB)
2. **Package Documentation**: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md
3. **Hello Tool Example**: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/hello.ts
4. **Extension Examples Directory**: https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions (50+ examples)
5. **Community Extension Collection**: https://github.com/emanuelcasco/pi-mono-extensions
6. **Pi.dev Website**: https://pi.dev
7. **Pi Mono Explained (Deep Dive)**: https://hoangyell.com/pi-mono-explained/
8. **HowTo Guide**: https://github.com/sysid/pi-extensions/blob/main/HowTo.md

---

*Report generated from comprehensive analysis of Pi Mono's extension system documentation and source code examples.*
