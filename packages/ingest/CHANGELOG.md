# @agentplugins/ingest

## 0.4.0

### Minor Changes

- ## v0.4.0 — Architecture re-shape + security hardening

  ### New packages

  - **`@agentplugins/contract`** — single-source-of-truth Zod manifest schema. All `PluginManifest` types now derive from one place; a `manifest.schema.json` is generated at build time.
  - **`@agentplugins/compile`** — shared codegen kernel extracted from core: `hook-wrapper`, `codegen`, `lint`, `validation`, `subprocess`, plus new secure emit helpers and path-traversal sanitizers.

  ### Security fixes (release-blocking)

  - **B2a** `sanitizeName()` in `store.addPluginFromSource` — rejects `..`, absolute paths, non-kebab-case plugin names before installing to the store.
  - **B2b** `sanitizeJoin()` for `nativeCopies.from/to` in `cli build` — prevents path traversal when copying native artifacts into the build output.
  - **A3/opencode** `emitCommandAsExecSync()` replaces template-literal interpolation + `shell:true` for command handler emission. Command string is JSON-encoded; plugin-root substitution uses runtime `.replace()`.
  - **A3/pimono** Same fix for pimono's `generateCommandHandlerBody` — JSON.stringify + runtime sentinel replace instead of template-literal injection.

  ### Architecture

  - `@agentplugins/core` is now a pure re-export facade; types come from `contract`, compile helpers from `compile`.
  - `PluginManifest` is a concrete TypeScript interface (not `Omit<z.infer<...>>`) so consumers don't need `zod` in their transitive type-resolution path.
  - `adapter-gemini` hook iteration updated to `Object.entries(plugin.hooks)` to match the `HookDefinition` contract API.

### Patch Changes

- Updated dependencies
  - @agentplugins/schema@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies
  - @agentplugins/schema@0.3.0
