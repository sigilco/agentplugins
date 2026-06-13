# AgentPlugin — Unified Plugin Library for AI Agent Harnesses

## Overview
Build a TypeScript library that uses Ports & Adapters (Hexagonal Architecture) to let developers write plugins once and compile them for multiple AI agent platforms (Claude Code, OpenCode, Codex, Gemini, Copilot CLI, Kimi, Pi Mono).

## Architecture
- **Core Domain**: Universal plugin hooks (transform, load, validate, execute)
- **The Port**: Abstract plugin interface (AgentPlugin API)
- **The Adapters**: Platform-specific wrappers that translate universal hooks to native plugin APIs
- **Value**: Write plugin logic once; ship to any agent harness

## Stage 1 — Research (Parallel)
- Research plugin APIs for all 6+ target platforms
- Extract: manifest format, hook types, registration mechanism, config schema, lifecycle
- Document findings in research.md

## Stage 2 — Design
- Design unified plugin interface (the "Port")
- Design adapter contract
- Design manifest/schema unification
- Design validation layer
- Create design.md

## Stage 3 — Implementation
- Scaffold TypeScript monorepo with pnpm workspaces
- Core library: ports, types, validation, plugin runner
- Adapters: Claude Code, OpenCode, Codex, Gemini, Copilot CLI, Kimi, Pi Mono
- Build system: compile platform-specific plugin packages
- Example: simple logging plugin targeting 2+ harnesses

## Stage 4 — Validation & Delivery
- Test build pipeline
- Verify example plugin compiles for each harness
- Validate against each platform's constraints
- Package for delivery

## Deliverables
- /mnt/agents/output/agentplugin/ — the library source
- /mnt/agents/output/agentplugin-example/ — example consumer project
- README with setup instructions
