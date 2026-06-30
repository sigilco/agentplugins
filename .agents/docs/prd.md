# AgentPlugins Product Requirements Document

## Executive Summary

AgentPlugins solves the fragmentation problem in AI agent plugin development. Plugin developers currently must maintain separate codebases for each platform (Claude Code, OpenCode, Codex, Copilot, Gemini, Kimi, Pi Mono). AgentPlugins provides a **universal plugin format** and **platform-specific adapters** (inspired by the unplugin pattern), enabling developers to write once and compile to multiple agent platforms.

## Problem Statement

### Current State
- **7+ AI agent platforms** exist with incompatible plugin ecosystems (Claude Code, OpenCode, Codex, Copilot, Gemini, Kimi, Pi Mono)
- Plugin developers must maintain **N separate codebases** for N platforms
- Each platform has different:
  - Hook/event semantics (e.g., `sessionStart` vs `session.SessionStart`)
  - File structure requirements (JSON manifests, TypeScript modules, config formats)
  - Handler types (inline, reference, HTTP, command, MCP, etc.)
  - CLI integration and deployment models

### Impact
- **High friction** for plugin ecosystem growth—developers avoid multi-platform support
- **Lock-in risk**—plugins tied to one platform can't easily move to another
- **Maintenance burden**—each platform change requires updates across all codebases
- **Slower ecosystem maturity**—fewer high-quality, cross-platform plugins

## Solution

### Core Concept
1. **Universal Plugin Format** — single YAML/JSON config declaring hooks, tools, commands, shortcuts, flags, and MCP servers
2. **Platform Adapters** — per-platform compilers that transform universal config into native formats
3. **CLI Tool** — single `agentplugins build` command to generate all platform outputs
4. **Framework-agnostic** — adapters handle all implementation details; plugins declare intent, not mechanics

### Design Principles
- **Separation of Concerns** — universal config is platform-agnostic; adapters handle platform quirks
- **Predictable Output** — generated code is always readable, deterministic, and hand-editable if needed
- **Minimal Dependencies** — adapters are lightweight; no runtime overhead
- **Extensible** — easy to add new adapters for emerging platforms

### Tier-1 Functional Parity

**Tier-1 harnesses: Claude Code, Codex, OpenCode, Pi Mono.** Tier-2: Copilot, Gemini, Kimi.

A plugin capability must deliver the same functionality across all four Tier-1 harnesses — at the functionality level, not the TUI level. We do not ship a feature that works on only one harness.

Five operating principles:

1. **Tier-1 parity is the bar.** Same functionality across Claude Code, Codex, OpenCode, Pi Mono. TUI-grade fidelity (overlays, widgets) is the only allowed degradation.
2. **Codegen first, guided per-harness fallback second.** Where universal codegen can express a capability across all Tier-1, do that. Where a harness lacks the native primitive, check whether all Tier-1 can support it via a custom (escape-hatch) method, and if so guide the author — rather than dropping the feature.
3. **Keep a compat matrix.** The living [Capability Matrix](../../docs/guide/capability-matrix.md) (published at `/guide/capability-matrix`) records what's universal-codegen, guided-per-harness, and genuinely unsupported. It's the contract for "same functionality, different plumbing."
4. **Lean, no global SDK.** Primitives express intent, not mechanism; each adapter owns its own plumbing. The escape hatch lets power users write native code against each harness's SDK.
5. **Multi-platform by default, platform-specific code allowed.** AgentPlugins gives plugin authors the foundations to distribute their plugin across all Tier-1 harnesses (Claude Code, Codex, OpenCode, Pi Mono). Authors are not forced to support every harness — they may target a single harness or ship harness-specific behavior (e.g., custom logging for one harness) when another harness lacks a needed primitive. The end goal is a distribution platform and utilities so authors can make a plugin usable in other harnesses without porting or rewriting the implementation. Think React Native or Rust: multi-platform by default, platform-specific code when you need it.

## Target Audience

### Primary
**Plugin Developers** — targeting 2+ AI agent platforms
- Want to ship to multiple platforms without code duplication
- Prefer a single source of truth for plugin logic
- Value readable, inspectable generated output

### Secondary
**Agent Platform Maintainers** — building ecosystems around Claude Code, OpenCode, Codex, etc.
- Want high-quality, community-driven plugins
- Benefit from easy onboarding of cross-platform plugins
- Can integrate AgentPlugins adapter support into platform documentation

## v1 Scope (WIP)

_Draft — this section reflects the current product direction and will be finalized ahead of the v1 release._

- **Distribution-first CLI** — `agentplugins add <github-url>` installs a plugin once; the universal store (`~/.agents/plugins/<name>/`) fans out via symlinks to every detected agent harness.
- **Skills.sh compatibility** — plugins exposing `SKILL.md` are first-class citizens; our CLI reads both AgentPlugins and Skills.sh layouts.
- **JSON Schema** — `@agentplugins/schema` package + hosted JSON Schema (`agentplugins.pages.dev/schema/v1.json`) for editor autocomplete and self-documenting manifests.
- **Parity primitives** — every shipped capability works across Claude Code, Codex, OpenCode, and Pi Mono. The [Capability Matrix](../../docs/guide/capability-matrix.md) is the living contract.
- **Security & audit guardrails** — `agentplugins audit` scores supply-chain risk (OSV, Scorecard, npm provenance); safe-fetch SSRF guard; lifecycle script policy.
- **Public launch** — registry, docs site, examples, and a stable v1 manifest format.

## Success Criteria

### Functional
- [ ] `agentplugins build` successfully compiles example-logger to all 7 platforms
- [ ] Generated outputs match each platform's native plugin format exactly
- [ ] Plugin runs without modification on Claude Code and OpenCode in real harnesses
- [ ] All hooks supported by at least one adapter; explicit errors for unsupported hooks

### Quality
- [ ] Universal manifest is simple: <100 lines YAML for typical plugin>
- [ ] Generated code is readable and matches platform conventions
- [ ] Comprehensive test coverage: contract tests, E2E verification, fixture validation
- [ ] Zero runtime errors in example-logger across all platforms

### Ecosystem
- [ ] Public npm release: @agentplugins/core, @agentplugins/cli, @agentplugins/adapter-*
- [ ] GitHub repo public; open for community contributions
- [ ] Examples and tutorials for 2 common use cases (custom tools, lifecycle hooks)

## Roadmap

The roadmap is maintained as a living board in [GitHub Project 14](https://github.com/users/espetro/projects/14/views/1). Individual milestones, tasks, and their statuses are tracked there rather than in prose here.

### Shipped releases

- **v0.1.0** (June 2026) — Core types + CLI + 7 platform adapters + example-logger plugin. Public npm release under `@agentplugins/*`.
- **v0.2.0** — Distribution pivot: `agentplugins add`, universal store + symlink fanout, 5 install channels, Skills.sh compatibility, JSON Schema, VitePress landing page.
- **v0.3.0** — Tier-1 parity wins (3.1–3.6), compat ingestor, security guardrails, community rewrites. See `CHANGELOG.md` at repo root for details.

## Technical Architecture

### Universal Plugin Manifest
```yaml
name: example-logger
version: 1.0.0
targets: [claude, opencode, codex, copilot, gemini, kimi, pimono]

hooks:
  sessionStart:
    handler:
      type: inline
      handler: |
        console.log("Session started");

tools:
  - name: log
    description: Log a message
    parameters:
      type: object
      properties:
        message: { type: string }

commands:
  - name: reset
    description: Reset plugin state
```

### Compilation Process
1. **Load & Validate** — Parse manifest; run universal + platform-specific validation
2. **Transform** — For each platform:
   - Map universal hooks to platform events
   - Generate platform-native files (JSON, TS, scripts, etc.)
   - Inline handler code or create references
3. **Output** — Write files to `dist/<platform>/` directory

### Adapter Interface
All adapters implement `PlatformAdapter`:
```typescript
interface PlatformAdapter {
  name: TargetPlatform;
  displayName: string;
  supportedHooks: UniversalHookName[];
  supportedHandlers: HandlerType[];
  manifestPath: string;
  manifestFormat: 'json' | 'toml';
  validate(plugin: PluginManifest): ValidationIssue[];
  compile(plugin: PluginManifest): AdapterOutput;
}
```

## Risk Mitigation

### Hook Semantics Divergence
- **Risk:** Different platforms interpret the same hook differently
- **Mitigation:** Explicit hook documentation per platform; contract tests validate behavior
- **Validation:** example-logger runs on real Claude Code + OpenCode instances

### Handler Wrapping Overhead
- **Risk:** Generated code adds runtime overhead (dynamic imports, wrapper layers)
- **Mitigation:** Inline handlers where possible; reference handlers use static imports
- **Monitoring:** Performance benchmarks in test suite

### Platform Changes
- **Risk:** Platforms evolve; adapters become stale
- **Mitigation:** Version adapters independently; changelog per adapter; LTS policy for v0.1.0

## Metrics & Success Indicators

### Adoption
- Number of plugins using AgentPlugins (target: 5+ by end of Q3 2026)
- npm download rate for @agentplugins/* packages
- GitHub stars and community contributions

### Quality
- % of generated plugins passing platform validation
- % of test coverage in adapter codebases
- Time to onboard a new platform (goal: <2 days for well-documented platform)

### Ecosystem
- Documented examples for >5 common use cases
- Video tutorials (goal: 3+ by v0.2.0)
- Community PRs and issues (goal: 10+ per month by v0.2.0)

## Conclusion

AgentPlugins removes the primary friction point in cross-platform plugin development. By providing a universal format + adapters pattern, we enable a thriving ecosystem of high-quality plugins that work seamlessly across AI agent platforms.
