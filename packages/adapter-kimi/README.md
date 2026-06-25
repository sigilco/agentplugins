# @agentplugins/adapter-kimi

> AgentPlugins platform adapter for [Kimi (Moonshot AI)](https://www.moonshot.cn/).

Compiles a universal `PluginManifest` into Kimi's plugin layout: `kimi.plugin.json` manifest, hook wiring, and MCP server config. Inline handlers are wrapped as command scripts.

## Installation

```bash
npm install @agentplugins/adapter-kimi
```

Typically installed transitively via [`@agentplugins/cli`](https://www.npmjs.com/package/@agentplugins/cli).

## Usage

```typescript
import { createKimiAdapter } from '@agentplugins/adapter-kimi';

const adapter = createKimiAdapter();
const output = await adapter.compile(manifest);
```

Or via the CLI:

```bash
npx agentplugins build --target kimi
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

Apache-2.0
