---
title: Extending the Build Pipeline – AgentPlugins
description: Add custom adapters, lint rules, IR transforms, and post-emit hooks to the AgentPlugins build pipeline without forking the tool.
---

# Extending the Build Pipeline

AgentPlugins ships seven built-in adapters. If you maintain an internal harness, want to add custom lint rules, or need to transform the manifest IR before code generation, the `plugins` field in `defineConfig` gives you full access to the build pipeline without forking anything.

## When to use `plugins`

| Need | Mechanism |
|---|---|
| Compile to a private/internal harness | `plugin.adapter` |
| Add project-specific lint checks | `plugin.lintRules` |
| Add a new emit language | `plugin.emitters` |
| Validate or reject the manifest before build | `plugin.preValidate` middleware |
| Mutate the manifest IR (e.g. inject metadata) | `plugin.transformIR` middleware |
| Inspect or rewrite emitted files per-target | `plugin.postEmit` middleware |
| Gate or audit install steps | `plugin.onInstall` / `plugin.onAudit` middleware |

## Basic setup

```typescript
// agentplugins.config.ts
import { defineConfig } from '@agentplugins/core'

export default defineConfig({
  manifest: {
    name: 'my-plugin',
    version: '1.0.0',
    description: 'My cross-platform plugin',
    hooks: { /* ... */ },
  },

  plugins: [
    {
      name: 'my-extension',
      // fields below — mix and match
    },
  ],
})
```

All `plugins` entries are composed on top of the built-in adapter set. Built-in adapters (claude, codex, …) are always registered first; your plugins run after and may override them by registering the same target name.

---

## Custom adapter

A `PlatformAdapter` tells the build system how to validate and compile the manifest into your harness's native format.

```typescript
// src/my-harness-adapter.ts
import type { PlatformAdapter } from '@agentplugins/core'

export const myHarnessAdapter: PlatformAdapter = {
  name: 'my-harness',              // target id — must match the targets[] list
  displayName: 'My Harness',
  supportedHooks: ['sessionStart', 'preToolUse', 'postToolUse'],
  supportedHandlers: ['command', 'inline'],
  manifestPath: 'my-harness.json',
  manifestFormat: 'json',

  validate(plugin) {
    // Return ValidationIssue[] — errors abort build, warnings are printed
    return []
  },

  compile(plugin) {
    return {
      files: [
        {
          path: 'my-harness.json',
          content: JSON.stringify({ name: plugin.name, version: plugin.version }, null, 2),
        },
      ],
      manifest: {},
      warnings: [],
      issues: [],
    }
  },
}
```

Wire it in via `defineConfig`:

```typescript
import { defineConfig } from '@agentplugins/core'
import { myHarnessAdapter } from './src/my-harness-adapter.js'

export default defineConfig({
  manifest: { name: 'my-plugin', version: '1.0.0', description: '…' },

  plugins: [
    { name: 'my-harness-adapter', adapter: myHarnessAdapter },
  ],

  targets: ['claude', 'my-harness'],
})
```

`my-harness` is now a valid target id. Unknown target ids that have no registered adapter are skipped at build time with a warning.

::: tip Full working example
`plugins/example-custom-adapter/` in the repository shows this pattern end-to-end, producing `dist/claude/` and `dist/my-harness/` from one `agentplugins build` run.
:::

---

## Custom lint rules

Add build-time checks that run alongside the built-in lint rules:

```typescript
import type { LintRule } from '@agentplugins/pipeline'

const requireLicenseRule: LintRule = {
  id: 'require-license',
  description: 'All plugins in this org must declare a license',
  check(ctx) {
    if (!ctx.manifest.license) {
      return [{
        severity: 'error',
        field: 'license',
        message: 'license is required for org plugins',
        suggestion: 'Add license: "MIT" to your manifest',
      }]
    }
    return []
  },
}

export default defineConfig({
  manifest: { /* … */ },
  plugins: [
    { name: 'org-rules', lintRules: [requireLicenseRule] },
  ],
})
```

Custom rules run in strict mode by default — errors abort the build, warnings are printed.

---

## Pipeline middleware

Middleware functions follow the standard `(ctx, next) => Promise<void>` onion pattern. Call `await next()` to proceed, or `ctx.abort(reason)` to stop the pipeline.

### `preValidate` — reject before validation

Runs before `validateUniversal()`. Use it to enforce org-wide manifest constraints:

```typescript
{
  name: 'org-guard',
  preValidate: async (ctx, next) => {
    if (!ctx.manifest.name.startsWith('acme-')) {
      ctx.abort('All ACME plugins must be named acme-*')
    }
    await next()
  },
}
```

### `transformIR` — mutate the manifest IR

Runs after validation, before code generation. Use it to inject metadata or normalize fields:

```typescript
{
  name: 'inject-build-metadata',
  transformIR: async (ctx, next) => {
    ctx.manifest = {
      ...ctx.manifest,
      description: `[${process.env.CI_COMMIT_SHA?.slice(0, 7) ?? 'local'}] ${ctx.manifest.description}`,
    }
    await next()
  },
}
```

### `postEmit` — inspect or rewrite emitted files

Runs per-target after the adapter has produced its files. `ctx.files` is the mutable list of `{ path, content }` entries:

```typescript
{
  name: 'add-banner',
  postEmit: async (ctx, next) => {
    ctx.files = ctx.files.map(f => ({
      ...f,
      content: `// Built by ACME CI — do not edit\n${f.content}`,
    }))
    await next()
  },
}
```

### `onInstall` — gate or audit install

Runs during `agentplugins add` / `agentplugins install`. The built-in `securityPlugin` is registered here by default (hash integrity, script policy). You may add your own checks after it:

```typescript
{
  name: 'org-install-policy',
  onInstall: async (ctx, next) => {
    if (ctx.pluginName.startsWith('untrusted-')) {
      ctx.abort(`Plugin "${ctx.pluginName}" is blocked by org policy`)
    }
    await next()
  },
}
```

::: warning
`onInstall` plugins run in the user's environment, not the plugin author's. Only ship install middleware as part of org-internal tooling, not in public plugins.
:::

---

## Plugin interface reference

```typescript
interface Plugin {
  readonly name: string

  // Compile
  adapter?: PlatformAdapter
  lintRules?: LintRule[]
  emitters?: Record<string, CodeEmitter>

  // Build pipeline middleware
  preValidate?: Middleware<BuildCtx>
  transformIR?: Middleware<BuildCtx>
  postEmit?: Middleware<TargetCtx>

  // Install pipeline middleware
  onAudit?: Middleware<InstallCtx>
  onInstall?: Middleware<InstallCtx>
}
```

Each field is optional — a plugin may contribute any combination.

## Middleware execution order

1. All `preValidate` chains run (user plugins after builtins)
2. `validateUniversal()` + `validateForPlatform()`
3. All `transformIR` chains run
4. `lint()` with merged lint rules
5. Per-target: `adapter.compile()` → all `postEmit` chains
6. Files written to `dist/`

Install pipeline:

1. All `onInstall` chains run (security middleware first)
2. Files linked into agent directories

## See also

- [Creating Plugins](/guide/creating-plugins) — manifest authoring from scratch
- [Adapters reference](/reference/adapters) — built-in adapter output formats
- [Linting](/guide/linting) — built-in lint rules
