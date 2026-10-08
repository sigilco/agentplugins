# AnyHarness

The package manager + extension runtime for agent harnesses — one `plugin.json`
(MCP + skills + hooks/commands/agents/rules) installed into every agent you use,
and one versioned bridge protocol so harnesses never build their own plugin system.

> **v2 rewrite in progress.** The TS codebase (`agentplugins` ≤0.6.x) is frozen on
> the [`legacy`](../../tree/legacy) branch. This `v2` branch hosts the AnyHarness
> rewrite; `main` still points at the last v1 release.
>
> Architecture + plan: `.agents/plans/2026-10-07-v2-foundation.md`.

## Install

```sh
# brew / mise / install.sh — GitHub Releases is canonical (coming soon)
```

## Packages

| Package                  | What it is                                                        |
| ------------------------ | ----------------------------------------------------------------- |
| `@any-harness/spec`      | Spec types + JSON Schema (manifest, lockfile, bridge protocol)    |
| `@any-harness/sdk`       | Isomorphic core: store, sources, trust/audit, bridge, emit kernel |
| `@any-harness/cli`       | `harness` binary — add/remove/list/update/doctor/init/serve       |
| `@any-harness/metaharness` | Minimal agent harness consumed entirely through the extension model |
| `@any-harness/emit-*`    | Per-harness emitters for non-conformant runtimes                  |

## Store

`~/.agents/` — shared namespace, coexistence-respecting:

```
~/.agents/
  skills/<name>/           # Agent Skills spec (already standard)
  harness/<name>/          # installed packages (our store)
  mcp.json                 # shared MCP declarations
  extensions.lock          # our lockfile
  anyharness.toml          # our config
```

## Status

Pre-alpha scaffold. See `.agents/plans/` for the current plan and `spec/` for the
spec drafts.
