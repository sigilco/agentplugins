# @agentplugins/adapter-codex

> AgentPlugins platform adapter for [OpenAI Codex CLI](https://developers.openai.com/codex/plugins).

Compiles a universal `PluginManifest` into OpenAI Codex's native plugin layout: `plugin.json` manifest and `hooks.json` hook wiring (inline handlers are wrapped as Node scripts that receive JSON on stdin and respond on stdout).

## Installation

```bash
npm install @agentplugins/adapter-codex
```

Typically installed transitively via [`@agentplugins/cli`](https://www.npmjs.com/package/@agentplugins/cli).

## Usage

```typescript
import { createCodexAdapter } from '@agentplugins/adapter-codex';

const adapter = createCodexAdapter();
const output = await adapter.compile(manifest);
```

Or via the CLI:

```bash
npx agentplugins build --target codex
```

## Output shape

A successful build writes to `dist/codex/`:

```
dist/codex/
├── .codex-plugin/
│   └── plugin.json
└── hooks/
    └── hooks.json
```

Install with: `cp -r dist/codex ~/.codex/plugins/`

## Hook protocol

Codex invokes hooks with a JSON event on **stdin** and expects a JSON response on **stdout**. Exit code `0` = allow, `2` = block (for `Stop` / `SubagentStop`).

## License

MIT
