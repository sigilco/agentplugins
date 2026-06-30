---
title: Reference
description: API reference for AgentPlugins — CLI commands, JSON schema, agent paths, and platform adapters.
---

# Reference

Technical reference for the AgentPlugins toolchain. For guides, how-to articles, and concept explanations, see the [Guide](/guide/introduction).

## CLI

| Command | Description |
|---|---|
| [`add`](/reference/commands#add) | Install a plugin from GitHub or a local path |
| [`remove`](/reference/commands#remove) | Remove a plugin and unlink from all agents |
| [`list`](/reference/commands#list) | List installed plugins |
| [`update`](/reference/commands#update) | Update plugin(s) from source |
| [`info`](/reference/commands#info) | Show plugin metadata and symlink status |
| [`doctor`](/reference/commands#doctor) | Diagnose store, symlinks, and agent detection |
| [`init`](/reference/commands#init) | Scaffold a new plugin interactively |
| [`build`](/reference/commands#build) | Compile plugin for all target platforms |
| [`validate`](/reference/commands#validate) | Validate manifest against schema |
| [`lint`](/reference/commands#lint) | Static analysis for common issues |
| [`preview`](/reference/commands#preview) | Preview compiled output for a target |

## Schema

- [JSON Schema](/reference/schema) — manifest schema, TypeScript types, Ajv validator

## Platform

- [Agent Paths](/reference/agent-paths) — store layout, per-agent skill paths, symlink layout
- [Adapters](/reference/adapters) — what each platform adapter emits

## Manifesto

For platform compatibility and capability decisions, see the [Capability Matrix](/guide/capability-matrix) in the Guide.
