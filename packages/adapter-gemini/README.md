# @agentplugins/adapter-gemini

> AgentPlugins platform adapter for [Google Gemini CLI](https://ai.google.dev/gemini-cli/docs).

Compiles a universal `PluginManifest` into a Gemini CLI **extension**: `gemini-extension.json` manifest, hook wiring, and MCP server config. Inline handlers are wrapped as command scripts.

## Installation

```bash
npm install @agentplugins/adapter-gemini
```

Typically installed transitively via [`@agentplugins/cli`](https://www.npmjs.com/package/@agentplugins/cli).

## Usage

```typescript
import { createGeminiAdapter } from '@agentplugins/adapter-gemini';

const adapter = createGeminiAdapter();
const output = await adapter.compile(manifest);
```

Or via the CLI:

```bash
npx agentplugins build --target gemini
```

## Output shape

A successful build writes to `dist/gemini/`:

```
dist/gemini/
├── gemini-extension.json
├── hooks/
│   └── hooks.json
└── .mcp.json
```

Install with: `gemini extensions install ./dist/gemini`

## License

MIT
