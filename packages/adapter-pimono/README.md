# @agentplugins/adapter-pimono

> AgentPlugins platform adapter for [Pi Mono](https://pi.mono/).

Generates TypeScript-native extensions for the Pi agent runtime from a universal `PluginManifest`. Pi Mono extensions are regular TS modules, so handlers are emitted as real functions rather than wrapped scripts.

## Installation

```bash
npm install @agentplugins/adapter-pimono
```

Typically installed transitively via [`@agentplugins/cli`](https://www.npmjs.com/package/@agentplugins/cli).

## Usage

```typescript
import { createPiMonoAdapter } from '@agentplugins/adapter-pimono';

const adapter = createPiMonoAdapter();
const output = await adapter.compile(manifest);
```

Or via the CLI:

```bash
npx agentplugins build --target pimono
```

## Output shape

A successful build writes to `dist/pimono/`:

```
dist/pimono/
└── <plugin-name>.ts
```

Install with: `cp -r dist/pimono ~/.pi/agent/extensions/`

## License

Apache-2.0
