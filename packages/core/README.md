# @agentplugins/core

> Core types, validation, and plugin registry for [AgentPlugins](https://github.com/sigilco/agentplugins).

`@agentplugins/core` defines the universal plugin manifest (`PluginManifest`), runs schema validation, and exposes the adapter registry that platform adapters register themselves with. It is the **Port** in AgentPlugins's Ports & Adapters (Hexagonal) architecture.

## Installation

```bash
npm install @agentplugins/core
```

Peer dependency: none. Runtime: Node 20+.

## What's in the box

- **`PluginManifest`** — the universal TypeScript shape every plugin declares against.
- **`definePlugin(manifest)`** — identity helper that returns the manifest as-is, with type inference.
- **`validateManifest(manifest)`** — runs structural + semantic checks and returns a list of `ValidationIssue` (severity-tagged).
- **`AdapterRegistry`** — central registry where adapters self-register; consumers query it by platform name.
- **`wrapInlineHandlers(manifest)`** — converts inline handler strings into the format each platform expects.
- **`UNIVERSAL_HOOK_NAMES`**, **`ALL_TARGETS`** — canonical enums for hooks and target platforms.

## Quick start

```typescript
import { definePlugin, validateManifest, AdapterRegistry } from '@agentplugins/core';

const manifest = definePlugin({
  name: 'my-plugin',
  version: '0.1.0',
  targets: ['claude', 'opencode'],
  hooks: {
    sessionStart: {
      handler: {
        type: 'inline',
        handler: async () => ({ additionalContext: 'Plugin loaded.' }),
      },
    },
  },
});

const issues = validateManifest(manifest);
if (issues.some(i => i.severity === 'error')) {
  throw new Error('Invalid plugin manifest');
}
```

## Related packages

- [`@agentplugins/cli`](https://www.npmjs.com/package/@agentplugins/cli) — build, validate, and scaffold plugins.
- [`@agentplugins/adapter-claude`](https://www.npmjs.com/package/@agentplugins/adapter-claude) and the other 6 platform adapters.
- Root repo: <https://github.com/sigilco/agentplugins>

## License

MIT
