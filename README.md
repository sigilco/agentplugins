# AgentPlugin

> **Write AI agent plugins once, ship to any harness.**

AgentPlugin is a unifying library for AI agent plugin development — inspired by [unplugin](https://unplugin.unjs.io/) (unified build plugins) and [LLVM](https://llvm.org/) (unified compiler IR). It uses **Ports & Adapters** (Hexagonal Architecture) to let you define a plugin once and compile it for Claude Code, OpenAI Codex, GitHub Copilot CLI, Google Gemini CLI, Kimi, OpenCode, and Pi Mono.

```
Your Plugin → AgentPlugin Core (Universal IR) → Platform Adapters → 7 Agent Harnesses
```

## Supported Platforms

| Platform | Status | Manifest | Inline Handlers |
|----------|--------|----------|-----------------|
| [Claude Code](https://code.claude.com/docs/en/plugins-reference) | Ready | `.claude-plugin/plugin.json` | Wrapped as scripts |
| [OpenAI Codex](https://developers.openai.com/codex/plugins) | Ready | `.codex-plugin/plugin.json` | Wrapped as scripts |
| [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-finding-installing) | Ready | `plugin.json` | Wrapped as scripts |
| [Google Gemini CLI](https://ai.google.dev/gemini-cli/docs) | Ready | `gemini-extension.json` | Wrapped as scripts |
| [Kimi (Moonshot)](https://www.moonshot.cn/) | Ready | `kimi.plugin.json` | Wrapped as scripts |
| [OpenCode](https://opencode.ai/docs/plugins/) | Ready | `opencode.json` | Native support |
| [Pi Mono](https://pi.mono/) | Ready | `package.json` (`pi` key) | Native support |

## Quick Start

### 1. Create a Plugin

```bash
npx @agentplugin/cli init my-plugin
```

This scaffolds a new plugin with `agentplugin.config.ts`:

```typescript
import { definePlugin } from '@agentplugin/core';

export default definePlugin({
  name: 'my-security-guard',
  version: '1.0.0',
  description: 'Blocks dangerous commands across all agents',

  targets: ['claude', 'codex', 'copilot', 'gemini', 'kimi', 'opencode', 'pimono'],

  hooks: {
    preToolUse: {
      handler: {
        type: 'inline',
        handler: async (ctx) => {
          if (ctx.toolName === 'bash' && JSON.stringify(ctx.toolInput).includes('rm -rf /')) {
            return { block: true, reason: 'Root deletion blocked' };
          }
        },
      },
    },
    sessionStart: {
      handler: {
        type: 'inline',
        handler: async () => ({
          additionalContext: 'Security guard plugin active.',
        }),
      },
    },
  },

  skills: [{
    name: 'security-guard',
    description: 'Security policy enforcement',
    content: 'When executing commands, always validate against security policies.',
  }],
});
```

### 2. Validate

```bash
npx agentplugin validate
```

### 3. Build

```bash
npx agentplugin build
```

Output:
```
dist/
  claude/       → .claude-plugin/plugin.json + hooks + skills
  codex/        → .codex-plugin/plugin.json + hooks + skills
  copilot/      → plugin.json + hooks.json + skills
  gemini/       → gemini-extension.json + hooks + skills
  kimi/         → kimi.plugin.json + hooks + skills
  opencode/     → TypeScript plugin file + opencode.json
  pimono/       → TypeScript extension + package.json
```

### 4. Install

Copy the generated files into your agent harness's plugin directory:

```bash
# Claude Code
cp -r dist/claude/.claude-plugin ~/.claude/skills/my-security-guard/

# Codex
cp -r dist/codex/.codex-plugin ~/.codex/plugins/

# Copilot CLI
copilot plugin install ./dist/copilot

# Gemini CLI
gemini extensions install ./dist/gemini

# Kimi
cp -r dist/kimi ~/.kimi/plugins/

# OpenCode
cp dist/opencode/*.ts .opencode/plugins/

# Pi Mono
cp -r dist/pimono ~/.pi/agent/extensions/
```

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     AgentPlugin Core                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ PluginManifest │  │  Validators  │  │  Hook Registry   │  │
│  │  (The Port)    │  │              │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└────────────────────┬─────────────────────────────────────────┘
                     │ compile(target)
        ┌────────────┼────────────┬────────────┐
        ▼            ▼            ▼            ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
  │  Claude  │ │   Codex  │ │  Copilot │ │  Gemini  │ │ ...
  │  Adapter │ │  Adapter │ │  Adapter │ │  Adapter │ │
  └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

### The Port (Universal Interface)

AgentPlugin defines a maximal common subset of capabilities across all platforms:

**Hooks** — 19 universal lifecycle events:
- Session: `sessionStart`, `sessionEnd`
- Prompt: `userPromptSubmit`, `userPromptExpansion`
- Tool: `preToolUse`, `postToolUse`, `postToolUseFailure`
- Permission: `permissionRequest`, `permissionDenied`
- Subagent: `subagentStart`, `subagentStop`
- Context: `preCompact`, `postCompact`
- Turn: `stop`, `stopFailure`
- System: `notification`, `fileChanged`, `cwdChanged`, `setup`

**Handlers** — 3 handler types:
- `command` — Shell script (supported by all)
- `http` — POST endpoint (Claude, Copilot)
- `inline` — TypeScript function (OpenCode, Pi Mono; auto-wrapped for others)

### The Adapters

Each adapter transforms the universal representation into the platform-native format:

| Platform | Hooks Supported | Handler Types | Key Constraints |
|----------|----------------|---------------|-----------------|
| Claude | 19/19 | command, http, prompt, mcp_tool, agent | Max 2KB keychain |
| Codex | 10/19 | command only | Exit 2 to block |
| Copilot | 11/19 | command, http, prompt | Fail-closed preToolUse |
| Gemini | 10/19 | command only | Exit 2 to block |
| Kimi | 5/19 | command only | Fail-open hooks |
| OpenCode | 8/19 | inline only | Bun runtime |
| Pi Mono | 12/19 | inline only | jiti loading |

## Validation

AgentPlugin catches cross-platform issues at build time:

```bash
$ npx agentplugin validate

🔍 AgentPlugin Validation

claude:
  ✓ No issues found

codex:
  ⚠ hooks.sessionEnd is not supported by codex — this hook will be ignored
    → Use "sessionStart" instead
  ⚠ hooks.userPromptSubmit is not supported by codex — this hook will be ignored

gemini:
  ⚠ hooks.postToolUse is not supported by gemini — this hook will be ignored
  ℹ Inline handlers on gemini will be auto-wrapped as command scripts

✅ All checks passed!
```

## Monorepo Structure

```
agentplugin/
├── packages/
│   ├── core/              # Universal types, validation, registry
│   ├── cli/               # Build and validate commands
│   ├── adapter-claude/    # Claude Code adapter
│   ├── adapter-codex/     # OpenAI Codex adapter
│   ├── adapter-copilot/   # GitHub Copilot CLI adapter
│   ├── adapter-gemini/    # Google Gemini CLI adapter
│   ├── adapter-kimi/      # Kimi (Moonshot) adapter
│   ├── adapter-opencode/  # OpenCode adapter
│   └── adapter-pimono/    # Pi Mono adapter
├── plugins/
│   └── example-logger/    # Example cross-platform plugin
└── pnpm-workspace.yaml
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run the example
cd plugins/example-logger
pnpm build
# → Check dist/ for generated platform outputs
```

## Why AgentPlugin?

### The Problem

Every AI agent framework has its own plugin system:

| Framework | Manifest | Hooks Format | Handler Types |
|-----------|----------|--------------|---------------|
| Claude Code | `.claude-plugin/plugin.json` | `hooks/hooks.json` | command, http, mcp_tool, prompt, agent |
| Codex | `.codex-plugin/plugin.json` | `hooks/hooks.json` | command only |
| Copilot CLI | `plugin.json` | `hooks.json` | command, http, prompt |
| Gemini CLI | `gemini-extension.json` | `hooks/` | command only |
| Kimi | `kimi.plugin.json` | `kimi-hooks.json` | command only |
| OpenCode | `package.json` | TypeScript hooks | inline only |
| Pi Mono | `package.json` | TypeScript events | inline only |

**7 frameworks, 7 different APIs.** Writing a plugin for all of them means maintaining 7 separate codebases.

### The Solution: Ports & Adapters

Like unplugin unified build tools and LLVM unified compilers, AgentPlugin unifies AI agent plugins:

1. **You write** a plugin using the universal AgentPlugin interface (the Port)
2. **AgentPlugin validates** your plugin against each target's constraints
3. **Adapters compile** your plugin into each platform's native format
4. **You ship** one codebase to 7 platforms

## Future Vision

AgentPlugin aims to become the **standardschema.dev** of AI agent plugins — a common foundation that:

1. Enables plugin authors to reach all agent harnesses with one implementation
2. Lets new agent frameworks join the ecosystem by implementing one adapter
3. Provides validation tooling that catches issues before runtime
4. Documents capabilities across platforms for informed plugin design

## License

MIT
