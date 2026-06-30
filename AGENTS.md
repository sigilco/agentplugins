GitHub Project is [https://github.com/users/espetro/projects/14](https://github.com/users/espetro/projects/14/views/1) .

## Operating Principles

**Tier-1 harnesses: Claude Code, Codex, OpenCode, Pi Mono.** Tier-2: Copilot, Gemini, Kimi.

1. **Tier-1 parity is the bar.** Every shipped capability must work across all four Tier-1 harnesses at the functionality level (not TUI level).
2. **Codegen first, guided per-harness fallback second.** Universal codegen where possible; otherwise guide the author via the escape hatch rather than dropping the feature.
3. **Compat matrix is the contract.** `docs/guide/capability-matrix.md` — universal-codegen / guided-per-harness / unsupported, per harness. Keep it current.
4. **Lean, no global SDK.** Primitives express intent; each adapter owns its plumbing.
5. **Community plugins are ground-up rewrites** in `agentplugins-<name>` sibling repos (e.g. `../agentplugins-caveman`), not mechanical ports.

Full detail: [`prd.md`](.agents/docs/prd.md)

## Commit & branch conventions

- Atomic conventional commits (`feat(adapter-pimono): fix subagentStop collision`)
- Feature work on `feat/*` branches off `develop`; merge to `develop`, then PR `develop → main` to release
- All plans in `.agents/plans/<date>-<purpose>.md` before implementation begins
- All work linked to a refined issue in [Project 14](https://github.com/users/espetro/projects/14/views/1)
