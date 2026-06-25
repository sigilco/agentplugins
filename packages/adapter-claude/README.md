# @agentplugins/adapter-claude

> AgentPlugins platform adapter for [Claude Code](https://code.claude.com/docs/en/plugins-reference).

Compiles a universal `PluginManifest` into Claude Code's native plugin layout: `plugin.json` manifest, `hooks.json` hook wiring, inline handler scripts, `skills/`, and MCP server configuration.

## Installation

```bash
npm install @agentplugins/adapter-claude
```

This package is typically installed transitively via [`@agentplugins/cli`](https://www.npmjs.com/package/@agentplugins/cli). Install it directly only if you're building a custom build pipeline.

## Usage

```typescript
import { createClaudeAdapter } from '@agentplugins/adapter-claude';

const adapter = createClaudeAdapter();
const output = await adapter.compile(manifest);
// → output.files: FileOutput[] of plugin.json, hooks/handlers, skills/, MCP config
```

You usually don't call the adapter directly — let `@agentplugins/cli` route to it via the registry:

```bash
npx agentplugins build --target claude
```

## Output shape

A successful build writes to `dist/claude/`:

```
dist/claude/
├── .claude-plugin/
│   └── plugin.json
├── hooks/
│   └── hooks.json
├── skills/
│   └── <skill-name>/
│       └── SKILL.md
└── .mcp.json
```

Install with: `cp -r dist/claude ~/.claude/skills/<plugin-name>`

## Supported hooks

`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`, `SubagentStop`, `SessionStart`, `SessionEnd`. See [HookContext in `@agentplugins/core`](https://www.npmjs.com/package/@agentplugins/core) for the universal hook names.

## License

Apache-2.0
