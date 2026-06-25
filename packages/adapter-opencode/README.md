# @agentplugins/adapter-opencode

> AgentPlugins platform adapter for [OpenCode](https://opencode.ai/docs/plugins/).

Generates OpenCode-compatible plugins from a universal `PluginManifest`: a TypeScript module with the plugin's hooks, tools, and MCP server config, plus a JSON descriptor.

## Installation

```bash
npm install @agentplugins/adapter-opencode
```

Typically installed transitively via [`@agentplugins/cli`](https://www.npmjs.com/package/@agentplugins/cli).

## Usage

```typescript
import { createOpenCodeAdapter } from '@agentplugins/adapter-opencode';

const adapter = createOpenCodeAdapter();
const output = await adapter.compile(manifest);
```

Or via the CLI:

```bash
npx agentplugins build --target opencode
```

## Output shape

A successful build writes to `dist/opencode/`:

```
dist/opencode/
├── <plugin-name>.ts
└── opencode.json
```

Install with: `cp dist/opencode/*.ts dist/opencode/opencode.json .opencode/plugins/`

## Native support

OpenCode natively executes TypeScript plugin modules, so inline handlers are emitted as real TypeScript functions (not wrapped scripts). This gives you first-class type checking and IDE support in the generated code.

## License

Apache-2.0
