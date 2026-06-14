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

## v0.1.0 Scope

### Core Components
1. **@agentplugins/core** — Universal plugin manifest types and validation
2. **CLI** (`agentplugins` binary) — build, validate, and test plugins
3. **7 Platform Adapters** — compile universal format to:
   - Claude Code (9 files: plugin.json, hooks.json, skills, MCP configs)
   - OpenCode (2 files: TypeScript plugin + config)
   - Codex (2 files)
   - Copilot (3 files)
   - Gemini (3 files)
   - Kimi (4 files)
   - Pi Mono (1 file: TypeScript extension module)
4. **example-logger Plugin** — reference implementation compiling to all 7 platforms
5. **Documentation** — README, getting started, adapter specs, examples

### Out of Scope for v0.1.0
- Plugin registry / marketplace
- Interactive plugin scaffolding (`agentplugins init`)
- Multi-language support (TypeScript only)
- Runtime plugin loading / hot-reload
- Browser-based plugin editor
- Advanced debugging tooling

## Success Criteria

### Functional
- [ ] `agentplugins build` successfully compiles example-logger to all 7 platforms
- [ ] Generated outputs match each platform's native plugin format exactly
- [ ] Plugin runs without modification on Claude Code and OpenCode in real harnesses
- [ ] All hooks supported by at least one adapter; explicit errors for unsupported hooks

### Quality
- [ ] Universal manifest is simple: <100 lines YAML for typical plugin
- [ ] Generated code is readable and matches platform conventions
- [ ] Comprehensive test coverage: contract tests, E2E verification, fixture validation
- [ ] Zero runtime errors in example-logger across all platforms

### Ecosystem
- [ ] Public npm release: @agentplugins/core, @agentplugins/cli, @agentplugins/adapter-*
- [ ] GitHub repo public; open for community contributions
- [ ] Examples and tutorials for 2 common use cases (custom tools, lifecycle hooks)

## Roadmap

### v0.1.0 (June 2026) — shipped
- Core types + CLI + 7 platform adapters
- example-logger plugin compiling to all 7 platforms
- Public npm release under `@agentplugins/*`

### v0.2.0 (Distribution MVP) — current focus
- **Distribution-first pivot**: `agentplugins add <github-url>` → universal store + symlink fanout to every detected agent
- 5 install channels: native binary, npm, Homebrew, curl, **Mise** (UBI backend day one)
- `~/.agents/plugins/<name>/` is the source of truth; per-agent dirs are symlinks
- Skills.sh compatibility (read `SKILL.md`, scan `~/.agents/skills/`)
- Bun-compiled native binaries for 8 targets → GitHub Releases
- `@agentplugins/schema` package + hosted JSON Schema at `agentplugins.dev/schema/v1.json`

### v0.3.0 (Spec + Conformance)
- JSON Schema finalized for v1 (skills, mcpServers, hooks, tools, commands, agents, rules, lspServers)
- Ajv validation in CLI (offline-capable)
- `agentplugins init` scaffolds a plugin
- Conformance test suite (fixture → expected output per adapter)
- Mise core plugin in `sigilco/mise-agentplugins`

### v0.4.0 (Adapter SDK + Codegen)
- JSON process ABI spec (`spec/v1/adapter.schema.json`)
- Adapter SDK in TS (helper library, not a hard requirement)
- Refactor 7 canonical adapters to use the SDK
- Hooks codegen per target (lifecycle event mapping)
- MCP codegen per target

### v1.0.0 (Public Launch)
- All 7 canonical adapters fully tested
- Public launch (registry, docs site, examples)
- Security warning at install time (Gen/Socket/Snyk scoring)
- Deprecation of v0.1.0 monolithic `agentplugins build` in favor of v0.4.0 per-component pipeline

See `docs/plan.md` for the full strategic context and `.agents/plans/2026-06-14-v0.2.0-distribution-pivot.md` for the implementation plan.

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
