# @agentplugin/cli

> Build, validate, and scaffold [AgentPlugin](https://github.com/espetro/agentplugin) plugins.

`@agentplugin/cli` is the `agentplugin` command-line tool. It compiles a universal `PluginManifest` into platform-native outputs for all 7 supported agent harnesses.

## Installation

```bash
# Use it directly with npx
npx @agentplugin/cli init my-plugin

# Or install globally
npm install -g @agentplugin/cli
agentplugin --help
```

## Commands

| Command | Purpose |
|---------|---------|
| `agentplugin init <name>` | Scaffold a new plugin project (creates `agentplugin.config.ts` + skeleton). |
| `agentplugin validate` | Validate the plugin manifest against the AgentPlugin schema and target constraints. |
| `agentplugin build` | Compile to **all** target platforms and write to `dist/<platform>/`. |
| `agentplugin build --target claude,opencode` | Compile to specific platforms only. |
| `agentplugin build --out-dir build` | Change the output directory (default: `dist`). |
| `agentplugin build --strict` | Fail the build on warnings, not just errors. |

## Quick start

```bash
# 1. Create a plugin
npx @agentplugin/cli init my-plugin
cd my-plugin

# 2. Edit agentplugin.config.ts
#    (add hooks, tools, commands, skills, MCP servers, etc.)

# 3. Validate the manifest
npx agentplugin validate

# 4. Build for all platforms
npx agentplugin build

# 5. Inspect the output
ls dist/
# → claude/  codex/  copilot/  gemini/  kimi/  opencode/  pimono/
```

## Configuration

The CLI looks for `agentplugin.config.ts` (or `.js`, `.mjs`, `.json`) in the current working directory. See [@agentplugin/core](https://www.npmjs.com/package/@agentplugin/core) for the manifest schema.

## Related packages

- [`@agentplugin/core`](https://www.npmjs.com/package/@agentplugin/core) — manifest types, validation, registry.
- Platform adapters: [`@agentplugin/adapter-claude`](https://www.npmjs.com/package/@agentplugin/adapter-claude), [`@agentplugin/adapter-codex`](https://www.npmjs.com/package/@agentplugin/adapter-codex), [`@agentplugin/adapter-copilot`](https://www.npmjs.com/package/@agentplugin/adapter-copilot), [`@agentplugin/adapter-gemini`](https://www.npmjs.com/package/@agentplugin/adapter-gemini), [`@agentplugin/adapter-kimi`](https://www.npmjs.com/package/@agentplugin/adapter-kimi), [`@agentplugin/adapter-opencode`](https://www.npmjs.com/package/@agentplugin/adapter-opencode), [`@agentplugin/adapter-pimono`](https://www.npmjs.com/package/@agentplugin/adapter-pimono).

## License

MIT
