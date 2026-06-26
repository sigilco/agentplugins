# Adapters

An adapter compiles the universal manifest into one target platform's native format. AgentPlugins ships seven adapters — one per supported agent. This page documents what each emits and the trade-offs.

## Adapter matrix

| Adapter | Output type | Native handlers | Hooks supported | `tools[]` | `mcpServers` |
|---|---|---|---|:---:|:---:|
| `claude` | JSON manifest + `commands.json` | command, http, reference | full | ⚠️ | ✅ |
| `codex` | JSON manifest | command | subset | ⚠️ | ✅ |
| `copilot` | JSON manifest | command, http, reference | subset | ⚠️ | ❌ |
| `gemini` | JSON manifest | command | subset | ⚠️ | ❌ |
| `kimi` | JSON manifest | command | subset | ⚠️ | ❌ |
| `opencode` | TypeScript plugin + `opencode.json` | inline (reference) | subset | ✅ | ✅ |
| `pimono` | TypeScript extension + `package.json` | inline (reference) | subset | ✅ | ✅ |

⚠️ = WARN emitted; `tools[]` is not natively emitted — use `mcpServers` for Claude/Codex (Tier-1 universal tool path).

Two families: **JSON-emitting** adapters (claude, codex, copilot, gemini, kimi) produce static manifest files the host reads at startup. **Code-emitting** adapters (opencode, pimono) produce real TypeScript modules the host imports and calls.

See the [Tier-1 Capability Matrix](/reference/compat-matrix) for full cross-harness details.

## JSON-emitting adapters

### claude

Emits a Claude Code plugin directory:

```
dist/claude/
  .claude-plugin/
    plugin.json            # manifest (name, version, description, ...)
  commands.json            # slash commands
  hooks/
    pre-tool-use.sh        # command handlers wrapped as scripts
    session-start.sh
  skills/
    <skill-name>/SKILL.md
```

- All handler types are supported natively.
- Inline/reference handlers are auto-wrapped as shell scripts that invoke the plugin module via the Bun runtime.

### codex

Emits a Codex CLI plugin directory:

```
dist/codex/
  .codex-plugin/
    plugin.json
  hooks/
    pre-tool-use.sh
```

- Supports `command` handlers only.
- Unsupported hooks are dropped at build time with a warning.
- Exit code `2` from a pre-tool handler blocks the action.

### copilot

Emits a GitHub Copilot CLI plugin directory:

```
dist/copilot/
  plugin.json
  hooks.json
  hooks/
    pre-tool-use.sh
```

- Supports `command` and `http` handlers natively.
- `preToolUse` is **fail-closed**: if the handler errors, the tool call is blocked.

### gemini

Emits a Gemini CLI extension directory:

```
dist/gemini/
  gemini-extension.json
  hooks/
    pre-tool-use.sh
```

- Supports `command` handlers only.
- Inline handlers are auto-wrapped as command scripts.

### kimi

Emits a Kimi (Moonshot) plugin directory:

```
dist/kimi/
  kimi.plugin.json
  hooks/
    pre-tool-use.sh
```

- Supports `command` handlers only.
- Hooks are **fail-open**: handler errors do not block the action.

## Code-emitting adapters

### opencode

Emits a real OpenCode plugin as TypeScript:

```
dist/opencode/
  plugin.ts                # typed Plugin export with native hooks
  opencode.json            # manifest (skills, mcpServers, commands)
```

- Hooks are mapped to OpenCode's native lifecycle (`tool.execute.before`, `session.start`, etc.).
- Inline/reference handlers are emitted as native async functions — no shell wrapping.
- Skills and MCP servers are declared in `opencode.json` and picked up by OpenCode's config loader.

::: tip
OpenCode runs on Bun, so inline handlers run in-process with no startup overhead. Prefer inline handlers when targeting OpenCode.
:::

#### OpenCode registration model

OpenCode auto-discovers any `.ts` file dropped in `~/.config/opencode/plugins/` — no `config.json` edits required. Both paths use this:

- **Codegen (universal plugins)**: adapter emits `plugin.ts` → linked as `<name>.ts` in the plugins dir.
- **Native modules (hand-crafted)**: ship the file as `.ts` (ESM; valid TypeScript). `agentplugins install` symlinks it from the store into the plugins dir, preserving `import.meta.url` so relative `require`/`import` paths resolve correctly.

If a native module is shipped as `.mjs`, `agentplugins` links it under a `.ts` name automatically and emits a WARN. Rename the source to `.ts` to silence it. `.js` files are left as-is with a WARN (ambiguous CJS/ESM — not auto-normalized).

### pimono

Emits a Pi Mono extension as a TypeScript module plus a `package.json`:

```
dist/pimono/
  index.ts                 # extension entry point
  package.json             # declares the `pi` key with extension metadata
```

- Hooks are mapped to Pi Mono's event system.
- Inline/reference handlers are emitted as native functions, loaded via [jiti](https://github.com/unjs/jiti).
- The `package.json` declares the extension under the `pi` key.

## Choosing an `emitLanguage`

Code-emitting adapters respect the `emitLanguage` field on the manifest:

```typescript
{
  emitLanguage: 'typescript' // default — also: 'javascript', 'go'
}
```

| Value | Effect |
|---|---|
| `typescript` | Emit `.ts` files (default). Best for editor support. |
| `javascript` | Emit `.js` files. Skip type checking. |
| `go` | Emit `.go` files (Pi Mono only, experimental). |

JSON-emitting adapters ignore this field.

## Hook coverage

Not every platform supports every universal hook. The build step reports dropped hooks:

```text
Building my-plugin@1.0.0

  codex:
    ⚠ hooks.sessionEnd is not supported by codex — will be ignored
    ⚠ hooks.userPromptSubmit is not supported by codex — will be ignored

  kimi:
    ⚠ hooks.userPromptSubmit is not supported by kimi — will be ignored

Built 7 targets.
```

Run [`agentplugins lint`](/guide/linting) to catch these before publishing — the `hook-coverage` rule surfaces every mismatch.

## Handler wrapping

When a JSON-emitting adapter encounters an `inline` or `reference` handler, it wraps the TypeScript function as a shell script that invokes the plugin module through the Bun runtime:

```bash
#!/usr/bin/env bash
exec bun "${PLUGIN_ROOT}/dist/handler.js" pre-tool-use "$@"
```

This means inline handlers work everywhere — at the cost of a Bun startup on platforms that don't support them natively. For latency-sensitive hooks on Claude/Codex/Gemini/Kimi, prefer `command` handlers.

## Adding a new adapter

An adapter is any executable that implements the **JSON process ABI**: read a manifest (stdin or `--manifest <file>`), compile platform-specific output, write files, and exit `0` (success) or non-zero (failure). This enables any-language adapters without SDK lock-in. See [`adapter.schema.json`](__DOCS_SITE__/schema/v1/adapter.schema.json) for the contract.

## Next steps

- [Manifest reference](/guide/manifest) — what every field means.
- [Hooks](/guide/hooks) — the 19 universal events.
- [Agent paths](/reference/agent-paths) — where each adapter writes its output.
