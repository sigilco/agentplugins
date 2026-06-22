# @agentplugins/adapter-copilot

> AgentPlugins platform adapter for [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-finding-installing).

Compiles a universal `PluginManifest` into the Copilot CLI plugin layout: `plugin.json` manifest, `hooks.json` hook wiring, `skills/<name>/SKILL.md` declarative skill docs, and `.mcp.json` MCP server configuration. This adapter takes an MCP-first approach — when `mcpServers` are defined in the manifest they are wired as the primary integration point. Inline handlers are wrapped as command scripts that the host invokes.

## Installation

```bash
npm install @agentplugins/adapter-copilot
```

Typically installed transitively via [`@agentplugins/cli`](https://www.npmjs.com/package/@agentplugins/cli).

## Usage

```typescript
import { createCopilotAdapter } from '@agentplugins/adapter-copilot';

const adapter = createCopilotAdapter();
const output = await adapter.compile(manifest);
```

Or via the CLI:

```bash
npx agentplugins build --target copilot
```

## Output shape

A successful build writes to `dist/copilot/`:

```
dist/copilot/
├── plugin.json
├── hooks.json
├── skills/
│   └── <name>/
│       └── SKILL.md
└── .mcp.json
```

Install with: `copilot plugin install ./dist/copilot`

## License

MIT
