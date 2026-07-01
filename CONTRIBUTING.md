# Contributing to AgentPlugins

## Quick start

```bash
git clone https://github.com/sigilco/agentplugins
cd agentplugins
pnpm install
pnpm --filter './packages/**' build
pnpm test
```

## Branch model

- `main` — release branch; protected, CI-gated, no direct pushes
- `develop` — integration branch; all feature work merges here first
- `feat/<scope>` — feature branches off `develop`

## Commit style

Atomic [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(adapter-opencode): emit mcpServers as mcp.servers
fix(cli): bump scaffolded devDeps to ^0.5.0
docs(quick-start): correct version output
```

One logical change per commit. Keep commits independently revertable.

## Adding a new adapter

1. Create `packages/adapter-<name>/` following the existing adapter structure.
2. Implement `validate()` and `compile()` from `@agentplugins/core/adapter`.
3. Register the adapter in `packages/cli/src/adapters.ts`.
4. Add a row to `docs/guide/capability-matrix.md`.
5. Ship a community plugin in a sibling repo `agentplugins-<name>`.

## Community plugins

Community plugins live in separate repos (`agentplugins-<name>`) — not in this monorepo. They are ground-up rewrites, not mechanical ports. See the [plugin authoring guide](https://agentplugins.pages.dev/guide/creating-plugins).

## Release hygiene

When backfilling historical GitHub Releases, only use `gh release create <tag>` / edit release notes. Never re-run `pnpm release`, `changeset publish`, or `npm publish` against an old checked-out tag once a newer version is already live on the registry — npm's default `latest` dist-tag goes to whichever publish happens *last*, not whichever semver is highest, so a backfill publish silently drags `latest` backward.

## PR checklist

- [ ] `pnpm test` passes
- [ ] `pnpm -r exec tsc --noEmit` passes
- [ ] Capability matrix updated if adapter behaviour changed
- [ ] Linked to a refined issue in [Project 14](https://github.com/users/espetro/projects/14/views/1)

## Code of conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
