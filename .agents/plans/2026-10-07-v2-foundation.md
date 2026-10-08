# Plan — AnyHarness v2 foundation (parallel workstreams)

Date: 2026-10-07 · Owner: espetro · Orchestrator: Devin session b930ce55
Reference: architecture draft 4 (session attachment), three research reports
(market map, `~/.agents` conventions, SDK outreach — also session attachments).

## Decisions already locked

- **Name**: AnyHarness. GitHub org `any-harness`, npm scope `@any-harness/*`,
  binary `harness`. Repo transfer to the org is a manual owner step (pending).
- **Branches**: `legacy` = frozen v1 (at develop tip); `v2` = rewrite branch
  (this scaffold); `main` = last v1 release line until superseded.
- **Store**: `~/.agents/harness/` (not `plugins/` — contested namespace).
- **Manifest**: Agent Plugins 1.0 `plugin.json` + `dev.anyharness/` vendor
  namespace for hooks/commands/agents/rules. JSON, never runtime-evaluated TS.
- **Bridge**: versioned JSON-RPC protocol, three transports (stdio primary,
  HTTP loopback optional, in-process for TS embeds/browser).
- **Metaharness**: build (don't vendor), web standards, AI SDK `ToolLoopAgent`
  loop + capability injection (calca agent-core precedent), unjs for env
  abstraction, scriptc-compilable.
- **Runtime fork**: scriptc spike decides TS→native vs Go rewrite (deadline'd).

## Phase 0 — orchestrator (done)

- [x] `legacy` branch pushed (frozen TS at develop tip)
- [x] `v2` branch: monorepo scaffold (this commit) — pnpm workspace,
      `@any-harness/{spec,sdk,cli,metaharness}` stubs, `spec/` docs tree,
      `apps/playground/` placeholder, catalog deps (zod, ai, unstorage, unenv,
      ofetch), updated AGENTS.md/README

## Parallel workstreams (child sessions)

Interface pins — shared names every spec/code stream must use:
`Extension` (installed unit), `ExtensionKind` (`skill | mcp | plugin |
hook | command | agent | rule`), `Capabilities` (host-injected env slots),
`ManifestRef` (pointer to a plugin.json + version), bridge ops exactly:
`capabilities.negotiate`, `extensions.list`, `extensions.get`, `hooks.invoke`,
`commands.resolve`, `skills.materialize`, `tools.call`, `events.notify`.

| # | Workstream | Branch → PR target | Deliverable |
|---|-----------|--------------------|-------------|
| W1 | scriptc spike (swe-2-max) | `spike/scriptc` off `legacy` — no PR, branch + report | Fix the 16 scriptc build errors on v1 CLI, produce a real binary; report {compiles? size, dynamic coverage, remaining blockers, GO/NO-GO} |
| W2 | L0 spec: store+manifest+lockfile+trust | `feat/l0-spec` → PR into `v2` | `spec/{store-layout,manifest,lockfile,trust}.md` + `.schema.json` companions |
| W3 | Bridge protocol v0.1 | `feat/bridge-spec` → PR into `v2` | `spec/bridge/protocol.md` + JSON-RPC JSON Schemas + transport specs + capability model |
| W4 | Metaharness skeleton | `feat/metaharness` → PR into `v2` | `packages/metaharness/` contract seam (AgentHarness/AgentSpec/Capabilities) + ToolLoopAgent impl + `apps/playground` stub consuming bridge via in-process binding; browser-safe (zero node: imports) |
| W5 | Issue-tracker reconciliation | n/a — issues on sigilco/agentplugins | Close verifiably-shipped items, re-scope/label rest (`legacy` vs `v2`); report of every action; ambiguous → draft-only |
| W6 | Outreach monitor + drafts | n/a — report only | Window check on jcode (#745, PRs #1260/#1263) + claurst #186 + crush; ready-to-post issue/comment drafts in a file for Quim's voice |
| W7 | Adversarial review of draft 4 | n/a — report only | Top-5 kill list ranked by severity + evidence that would flip each |

Rules for all children: clone `sigilco/agentplugins`, conventional commits, no
Co-authored-by, never restructure the scaffold (add files inside assigned paths
only), write final report to a file and attach it (channel output truncates).

## Sequenced after children return

1. Spike verdict → lock runtime (Path A stays TS + scriptc, else Go decision).
2. Spec reviews: Quim reviews `spec/` PRs; bridge spec becomes the artifact
   attached to claurst/jcode outreach.
3. M1 build-out: `sdk` store+sources+lockfile impl against the spec PRs;
   `cli` commands on top; emitters after.
4. Outreach posts (Quim's voice or approved Devin posting).
5. Repo transfer to `any-harness` org (Quim, owner-only action).

## Explicitly out of scope this round

- Actual emitter implementations (M3)
- Registry/marketplace backend (M4+)
- Cloud-harness (Devin) emitter — hypothesis stays tier-2/post-M3
- npm org creation `@any-harness` (Quim action when publishing time comes)

## Wave 2 — implementation (2026-10-08, owner decisions applied)

Pinned cross-child interface (both sides code against this; drift reconciled at merge):

```ts
// @any-harness/sdk — isomorphic ONLY (zero node:*)
interface StorePorts { fs: FsPort; exec: ExecPort }
createStore(root: string, ports: StorePorts): Store
// Store: list / install / remove / setEnabled / materialize / verify / doctor
resolveSource(input: string): SourceRef  // git | github | local | registry coords
handleBridgeRequest(store, req: JsonRpcRequest): Promise<JsonRpcResponse> // all 8 ops
// node ports (node:fs, child_process git) live in packages/cli/src/ports/ — cli owns them
```

| # | Workstream | Branch → PR target | Deliverable |
|---|-----------|--------------------|-------------|
| W8 | sdk core (swe-2-max) | `feat/sdk-core` → PR into `v2` | `packages/sdk`: store layout + atomic writes + mutex, sources (git binary/github/local), lockfile + SRI digest, config.toml, trust policy + audit.log, materialization, all 8 bridge ops via `handleBridgeRequest`; in-memory test ports; zero node:* |
| W9 | cli + serve (swe-2-high) | `feat/cli` → PR into `v2` | `packages/cli`: flag-driven `add/remove/list/enable/disable/verify/doctor/audit/serve` per scriptc island constraints; node ports impl; `serve` = stdio NDJSON pump → `handleBridgeRequest` |
| W10 | claurst reference-integration design (swe-2-high) | n/a — report + scratch PoC | Design doc: bridge client PR vs `plugin.toml` loader + manifest translation; Rust client PoC vs spec/bridge (NDJSON fixtures); draft PR outline; #186 window re-check |
