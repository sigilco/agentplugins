# @any-harness/metaharness — agent notes

Contract seam between a host and whichever agent loop backs it, plus the
in-process bridge client the loop consumes extension surfaces through.
AI SDK (`ToolLoopAgent`) is the only implementation today.

## Hard rules

- **Isomorphic**: zero `node:*` imports — `unenv`/`unstorage`/`ofetch` when an
  env shim is ever needed. This package must compile for browser and scriptc.
- **Interface-first**: object shapes are `interface`; unions stay `type`.
- **No harness logic here**: loop, approvals, retries live in the impl. If
  you're writing a loop, stop — it belongs in the harness impl.
- All tool I/O via `Capabilities` → the tool `context` option; never globals.
- Env differences arrive via injected `Capabilities` — absent slots
  (computer-only: `exec`, fs-backed `storage`/`bridge`) degrade in the tool
  `execute`, never via `#ifdef`-style branches on the environment.
- Bridge op names are pinned in `.agents/plans/2026-10-07-v2-foundation.md`;
  don't invent new ones — they belong in `spec/bridge/` first.

## Layout

| File              | Purpose                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `src/harness.ts`  | Contract: `AgentHarness`, `AgentSpec`, `Capabilities`, `HarnessRunInput` |
| `src/bridge.ts`   | Bridge ops table, `BridgeClient`, `inProcessBridge` binding          |
| `src/ai-sdk.ts`   | `aiSdkHarness` — `ToolLoopAgent` adapter                              |
| `src/tools.ts`    | `extensionTools()` — bridge surfaces + computer-only exec as tools   |
| `src/harness.test.ts` | Mock-model smoke test via `ai/test` `MockLanguageModelV4`        |
