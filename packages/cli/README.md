# @agentplugins/cli

> Build, validate, and scaffold [AgentPlugins](https://github.com/espetro/agentplugins) plugins.

`@agentplugins/cli` is the `agentplugins` command-line tool. It compiles a universal `PluginManifest` into platform-native outputs for all 7 supported agent harnesses.

## Installation

```bash
# Use it directly with npx
npx @agentplugins/cli init my-plugin

# Or install globally
npm install -g @agentplugins/cli
agentplugins --help
```

## Commands

| Command | Purpose |
|---------|---------|
| `agentplugins init <name>` | Scaffold a new plugin project (creates `agentplugins.config.ts` + skeleton). |
| `agentplugins validate` | Validate the plugin manifest against the AgentPlugins schema and target constraints. |
| `agentplugins build` | Compile to **all** target platforms and write to `dist/<platform>/`. |
| `agentplugins build --target claude,opencode` | Compile to specific platforms only. |
| `agentplugins build --out-dir build` | Change the output directory (default: `dist`). |
| `agentplugins build --strict` | Fail the build on warnings, not just errors. |

## Quick start

```bash
# 1. Create a plugin
npx @agentplugins/cli init my-plugin
cd my-plugin

# 2. Edit agentplugins.config.ts
#    (add hooks, tools, commands, skills, MCP servers, etc.)

# 3. Validate the manifest
npx agentplugins validate

# 4. Build for all platforms
npx agentplugins build

# 5. Inspect the output
ls dist/
# → claude/  codex/  copilot/  gemini/  kimi/  opencode/  pimono/
```

## Configuration

The CLI looks for `agentplugins.config.ts` (or `.js`, `.mjs`, `.json`) in the current working directory. See [@agentplugins/core](https://www.npmjs.com/package/@agentplugins/core) for the manifest schema.

## Related packages

- [`@agentplugins/core`](https://www.npmjs.com/package/@agentplugins/core) — manifest types, validation, registry.
- Platform adapters: [`@agentplugins/adapter-claude`](https://www.npmjs.com/package/@agentplugins/adapter-claude), [`@agentplugins/adapter-codex`](https://www.npmjs.com/package/@agentplugins/adapter-codex), [`@agentplugins/adapter-copilot`](https://www.npmjs.com/package/@agentplugins/adapter-copilot), [`@agentplugins/adapter-gemini`](https://www.npmjs.com/package/@agentplugins/adapter-gemini), [`@agentplugins/adapter-kimi`](https://www.npmjs.com/package/@agentplugins/adapter-kimi), [`@agentplugins/adapter-opencode`](https://www.npmjs.com/package/@agentplugins/adapter-opencode), [`@agentplugins/adapter-pimono`](https://www.npmjs.com/package/@agentplugins/adapter-pimono).

## License

MIT
