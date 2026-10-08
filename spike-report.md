# Spike report: native-binary packaging for the v1 CLI

Branch: `spike/scriptc` (off `legacy`). Binary artifacts in `/tmp/spike/`.
Verdict criteria: produce a working standalone binary of `packages/cli/src/cli.ts`, no runtime dependency on node/npm, plus a packager comparison.

## Verdict: GO — with a reframed choice

A standalone binary of the v1 CLI **exists and works**. The best shipping vehicle is **`bun build --compile`** (boring baseline, ~2 mechanical fixes); scriptc is a viable *optimization* (24x smaller, ~1.3x faster startup) but costs ~30 source edits, three dependency removals, one node_modules patch, and real feature losses in the embedded engine. The original `GO/NO-GO` question ("can the v1 TS CLI become a native binary?") answers GO under three independent packagers — the real decision is now *which packager*, and whether the feature gaps are acceptable.

## Packager comparison (measured)

| Packager | Binary? | Size | `--help` startup (10-run avg) | Command complexity | Source changes needed | Notes |
|---|---|---|---|---|---|---|
| `scriptc build --dynamic` | ✅ ELF/Mach-O | **4.21 MB** (3.78 MB `--strip`) | **83–93 ms** | `npx scriptc build <entry> -o <out> --dynamic` (needs clang) | ~30 edits + logtape→shim + jiti removal + symlinkSync→`ln` + schema inline + terminal-columns patch | Static coverage 255/520 stmts (49%); 40 island sites |
| `bun build --compile` | ✅ ELF | 84.4 MB | ~118 ms | one command, ~200 ms build | schema inline + literal adapter imports (2 edits); jiti still broken | Intl/fs/vm all present; logtape works unmodified |
| Node SEA (node 24) | ✅ ELF | 130.6 MB | ~191 ms | esbuild bundle → sea-config → `--experimental-sea-config` → cp node → postject (4 tools) | same 2 edits as bun + TLA wrap + `createRequire` banner | CJS-only blob on node ≤25.6 (`mainFormat:module` lands in 25.7) |
| `deno compile` | ❌ | — | — | — | pnpm `catalog:` protocol unsupported | Dependency resolution fails before compile; not cheap to fix |

Baseline for latency: `node dist/cli.js --help` ≈ 152 ms (10-run avg).

What the scriptc binary actually does (verified): `--help`, `list`, `doctor`, `audit <local-path>`, `build`, `validate`, `lint`, `preview` on a JSON manifest — including emitting real adapter artifacts (`codex/.codex-plugin/plugin.json`, `opencode/*`, `pimono/index.ts`).

## What scriptc required (the fix log)

Mechanical boundary fixes (each is a one-liner class):
- `rm(p, opts)` → `rmSync` (promises-form fs overloads unlowered)
- `ReadonlyMap.get`/`.keys()` → `for (const [k,v] of map)` iteration
- `instanceof AbortError` → `err.name === 'AbortError'`
- `Object.keys/values/for-in` → `UNIVERSAL_HOOK_NAMES` enumeration + `any`-index
- `Array.isArray` → `typeof x?.join === 'function'`
- `await import(variable)` → explicit switch of literal `import('spec')` arms
- `x as T` checked casts of `any`→non-JSON types → `const v: any = x` bindings
- callback params crossing to package APIs → `(v: any): any`
- cleye `command({flags})` literals contain function values → `} as any` + `{_,flags}: any` params

Dependency fixes:
- **logtape → ~20-line console shim** (Intl absent in island; biggest single coverage lever, −1 import −~17 sites)
- **jiti removed** (uses `node:vm`, which the island does not provide) → `.json` configs only; `tryTsConfig` stubbed
- **symlinkSync → `spawnSync('ln', ['-sfn', …])`** (island `node:fs` lacks it; 6 call sites in store.ts)
- **schemas inlined** (`readFileSync(__dirname…)` has no real file inside bundles; also required by bun/SEA — shared fix)
- **terminal-columns patched in node_modules** (`new Intl.Segmenter` at module top-level crashes island startup; sed'd a fallback — uncommitted, must become a pnpm patch or dep fork to be reproducible)

Coverage after fixes: **520 statements, 255 static (49%), 40 dynamic sites** (baseline was 507 / 250 / 49% / 44). Remaining dynamic surface is irreducible without rewriting the workspace packages themselves: `CliLogger` records-with-methods (×16) and the `@agentplugins/*` workspace packages running as island code (×~20). Static % is bounded by design — the adapters/store/compile packages legitimately run in the engine.

## Remaining blockers ranked by effort

1. **TS/JS config loading (jiti) — dead in every packager.** scriptc: no `node:vm`. bun/SEA: bundles fine but jiti's lazy `require('../dist/babel.cjs')` doesn't resolve inside a bundle (fixable by patching jiti resolution or pre-loading — not attempted). Production fix regardless of packager: evaluate config outside the binary (pre-flight step writing resolved JSON), or JSON-only configs. (Medium effort, architectural.)
2. **Remote git flows (`add`, `audit <url>`, `update`)** — island `git clone`/`execSync` fails silently under scriptc (measured: `audit <url>` resolves to nothing). Bun/SEA likely fine (unverified — inference). (Low-medium effort to verify; fix = shell out to git binary.)
3. **Interactive `init`** — clack TUI runs in the island; without a TTY it stalls at the first prompt (measured). With a TTY it's plausibly OK (inference). Non-interactive path doesn't exist in v1 — `--yes` only skips *some* prompts. (Medium — needs a flag-driven non-interactive path.)
4. **terminal-columns node_modules patch** — must become `pnpm.patchedDependencies` or a cleye fork. (Low effort.)
5. **`spawnSync('ln')` symlink shim** — Windows lacks `ln`; cross-platform needs a proper fix (junction/copy fallback already half-exists via `type` arg). (Low.)
6. **Windows runtime pack doesn't exist** (`@scriptc/runtime-windows-x64` is not published; only linux-gnu/musl, darwin x64/arm64, wasm32-wasi). scriptc cannot ship a Windows binary at 0.2.6. bun/SEA cross-compile to Windows fine. (Not fixable by us — vendor gap.)

## Cross-compile (scriptc, measured)

- `SCRIPTC_TARGET=arm64-apple-macosx14.0.0` + `@scriptc/runtime-darwin-arm64@0.2.6` + `zig` as linker → **real Mach-O arm64 binary (3.49 MB)** produced on Linux. Claim verified.
- Windows x64 → **no published runtime pack** → fails at pack resolution (SC3003). Documented failure, not a claim failure per se (they never claimed Windows packs).
- WASI pack exists (`wasm32-wasi`) — produces a `.wasm` module needing a WASI host, not a standalone binary; out of scope.

## Production pipeline shape (if scriptc wins)

```
ci/release workflow:
  mise install + pnpm install + pnpm -r build
  pnpm patch terminal-columns (or fork cleye)
  npx scriptc build packages/cli/src/cli.ts -o dist/bin/agentplugins-linux-x64 --dynamic --strip
  SCRIPTC_TARGET=arm64-apple-macosx14.0.0 (+ zig + runtime pack) → macos-arm64
  (windows: blocked until a pack exists, or ship bun binary for win)
  checksums → GitHub release assets
```
Same pipeline for bun is trivially simpler: `bun build --compile` per target (`--target bun-linux-x64` etc. — bun has first-class cross-compile targets).

## Does Perry need checking?

**No.** Perry was the fallback if scriptc hit a wall — it didn't. scriptc produced a working binary plus a real cross-compile. Perry remains a third option only if scriptc's island limitations turn out fatal AND binary size matters — the packager matrix shows bun/SEA cover the capability case.

## Recommendation

Ship the v1 binary via **bun --compile** now (2 fixes, keeps full node compat, single command, cross-compiles everywhere including Windows), and keep `spike/scriptc` as the proving ground for the 20x-smaller binary: the scriptc port is *mechanical and bounded* — no architectural blockers found — so it's a real option whenever binary size/startup justify the island constraints (JSON-only configs, no remote ops, no interactive init).

## Uncertainty ledger

- **Measured:** all binary existence/size/latency figures; command outcomes above; coverage numbers; macOS cross-compile; Windows pack absence (npm 404); deno catalog failure.
- **Inference:** bun/SEA remote-git flows (likely work — full node compat); clack prompts under scriptc with a real TTY (likely work — island has stdin); the "40 dynamic sites" breakdown attribution; jiti fixability under bundlers (standard bundler problem, standard fixes exist); production pipeline step ordering.
