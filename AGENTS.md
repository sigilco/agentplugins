# AGENTS.md — AnyHarness (v2)

> **v2 rewrite in progress.** The v1 TS codebase is frozen on the `legacy` branch.
> Current plan: `.agents/plans/2026-10-07-v2-foundation.md`.
> Project board: https://github.com/users/espetro/projects/14

## What this is

AnyHarness is the **convergence layer for agent extensions**: package manager +
trust layer + versioned bridge protocol + per-harness emitters. We follow specs
and standards (MCP, Agent Skills spec, Agent Plugins 1.0) rather than porting to
every harness; our spec contribution is the extension-management + bridge slot.

## Operating principles

1. **Convergence, not ports.** Tier-1 attaches to *converged surfaces* (≥2 harnesses
   sharing an SDK shape), not only marquee names. One emitter can cover a family.
2. **Isomorphic core.** `packages/sdk` and `packages/metaharness` must contain zero
   `node:*` imports — use `unenv`/`unstorage`/`ofetch`. Environment differences
   arrive via injected `Capabilities`, never conditionals. This is what lets the
   same codebase ship as npm package, `scriptc` binary, and browser bundle.
3. **Coexistence in `~/.agents/`.** We own `harness/`; we adopt `skills/`; we never
   touch `plugins/` (Codex catalog) or rival claimants' keys.
4. **Data, not code.** Manifests are JSON (Agent Plugins `plugin.json` base +
   `dev.anyharness/` namespace). Authoring stays TS, compiled to JSON at build
   time — no runtime eval.
5. **Bridge is a versioned protocol**, not an ABI. `protocolVersion` handshake +
   capability negotiation; three transports (stdio / HTTP loopback / in-process).
6. **Spec-first.** Behavior changes start in `spec/`, get reviewed, then land in
   `packages/spec` as types + JSON Schema.

## Commit & branch conventions

- Atomic conventional commits (`feat(sdk): add store layout reader`)
- v2 work on `feat/*` branches off `v2`; PR into `v2`. `legacy` is frozen;
  `main` stays the v1 release line until v2 supersedes.
- All plans in `.agents/plans/<date>-<purpose>.md` before implementation begins.
- All work linked to a refined issue in [Project 14](https://github.com/users/espetro/projects/14/views/1).
- No `Co-authored-by:` trailers.
