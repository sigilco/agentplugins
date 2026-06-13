# @agentplugin/adapter-gemini

> AgentPlugin platform adapter for [Google Gemini CLI](https://ai.google.dev/gemini-cli/docs).

Compiles a universal `PluginManifest` into a Gemini CLI **extension**: `gemini-extension.json` manifest, hook wiring, and MCP server config. Inline handlers are wrapped as command scripts.

## Installation

```bash
npm install @agentplugin/adapter-gemini
```

Typically installed transitively via [`@agentplugin/cli`](https://www.npmjs.com/package/@agentplugin/cli).

## Usage

```typescript
import { createGeminiAdapter } from '@agentplugin/adapter-gemini';

const adapter = createGeminiAdapter();
const output = await adapter.compile(manifest);
```

Or via the CLI:

```bash
npx agentplugin build --target gemini
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
