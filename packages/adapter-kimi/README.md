# @agentplugin/adapter-kimi

> AgentPlugin platform adapter for [Kimi (Moonshot AI)](https://www.moonshot.cn/).

Compiles a universal `PluginManifest` into Kimi's plugin layout: `kimi.plugin.json` manifest, hook wiring, and MCP server config. Inline handlers are wrapped as command scripts.

## Installation

```bash
npm install @agentplugin/adapter-kimi
```

Typically installed transitively via [`@agentplugin/cli`](https://www.npmjs.com/package/@agentplugin/cli).

## Usage

```typescript
import { createKimiAdapter } from '@agentplugin/adapter-kimi';

const adapter = createKimiAdapter();
const output = await adapter.compile(manifest);
```

Or via the CLI:

```bash
npx agentplugin build --target kimi
```

## Output shape

A successful build writes to `dist/kimi/`:

```
dist/kimi/
├── kimi.plugin.json
├── hooks/
│   └── hooks.json
├── skills/
└── .mcp.json
```

Install with: `cp -r dist/kimi ~/.kimi/plugins/`

## License

MIT
