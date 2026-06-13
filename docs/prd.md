# AgentBridge Product Requirements Document

## Executive Summary

AgentBridge solves the fragmentation problem in AI agent plugin development. Plugin developers currently must maintain separate codebases for each platform (Claude Code, OpenCode, Codex, Copilot, Gemini, Kimi, Pi Mono). AgentBridge provides a **universal plugin format** and **platform-specific adapters** (inspired by the unplugin pattern), enabling developers to write once and compile to multiple agent platforms.

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
3. **CLI Tool** — single `agentbridge build` command to generate all platform outputs
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
- Can integrate AgentBridge adapter support into platform documentation

## v0.1.0 Scope

### Core Components
1. **@agentplugin/core** — Universal plugin manifest types and validation
2. **CLI** (`agentbridge` binary) — build, validate, and test plugins
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
- Interactive plugin scaffolding (`agentbridge init`)
- Multi-language support (TypeScript only)
- Runtime plugin loading / hot-reload
- Browser-based plugin editor
- Advanced debugging tooling

## Success Criteria

### Functional
- [ ] `agentbridge build` successfully compiles example-logger to all 7 platforms
- [ ] Generated outputs match each platform's native plugin format exactly
- [ ] Plugin runs without modification on Claude Code and OpenCode in real harnesses
- [ ] All hooks supported by at least one adapter; explicit errors for unsupported hooks

### Quality
- [ ] Universal manifest is simple: <100 lines YAML for typical plugin
- [ ] Generated code is readable and matches platform conventions
- [ ] Comprehensive test coverage: contract tests, E2E verification, fixture validation
- [ ] Zero runtime errors in example-logger across all platforms

### Ecosystem
- [ ] Public npm release: @agentplugin/core, @agentplugin/cli, @agentplugin/adapter-*
- [ ] GitHub repo public; open for community contributions
- [ ] Examples and tutorials for 2 common use cases (custom tools, lifecycle hooks)

## Roadmap

### v0.1.0 (June 2026)
- Ship core + 7 adapters + example plugin
- Public npm release
- Baseline documentation

### v0.2.0 (Q3 2026)
- 2+ additional adapters (emerging platforms)
- Interactive `agentbridge init` scaffolding
- Enhanced CLI: `agentbridge lint`, `agentbridge preview`
- Video tutorials and blog posts

### v0.3.0 (Q4 2026)
- Plugin registry prototype
- Web-based plugin submission UI
- Advanced hook matchers and conditional compilation
- Multi-language support (JavaScript, Go, etc.)

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
- Number of plugins using AgentBridge (target: 5+ by end of Q3 2026)
- npm download rate for @agentplugin/* packages
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

AgentBridge removes the primary friction point in cross-platform plugin development. By providing a universal format + adapters pattern, we enable a thriving ecosystem of high-quality plugins that work seamlessly across AI agent platforms.
