# @agentplugin/adapter-copilot

> AgentPlugin platform adapter for [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-finding-installing).

Compiles a universal `PluginManifest` into the Copilot CLI plugin layout: `plugin.json` manifest, `hooks.json` hook wiring, and MCP server configuration. Inline handlers are wrapped as command scripts that the host invokes.

## Installation

```bash
npm install @agentplugin/adapter-copilot
```

Typically installed transitively via [`@agentplugin/cli`](https://www.npmjs.com/package/@agentplugin/cli).

## Usage

```typescript
import { createCopilotAdapter } from '@agentplugin/adapter-copilot';

const adapter = createCopilotAdapter();
const output = await adapter.compile(manifest);
```

Or via the CLI:

```bash
npx agentplugin build --target copilot
```

## Output shape

A successful build writes to `dist/copilot/`:

```
dist/copilot/
├── plugin.json
├── hooks/
│   └── hooks.json
└── .mcp.json
```

Install with: `copilot plugin install ./dist/copilot`

## License

MIT
