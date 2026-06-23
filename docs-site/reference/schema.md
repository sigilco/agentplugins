# JSON Schema

The AgentPlugins manifest is defined by a published JSON Schema. Use it for editor autocomplete, programmatic validation, and CI checks.

## Locations

| Source | URL / package |
|---|---|
| Hosted | `__DOCS_SITE__/schema/v1.json` |
| Raw (GitHub) | `https://raw.githubusercontent.com/sigilco/agentplugins/main/spec/v1/manifest.schema.json` |
| npm | `@agentplugins/schema` |
| Agent paths schema | `__DOCS_SITE__/schema/v1/agent-paths.json` |

## Editor autocomplete

Add `$schema` to any JSON manifest to get autocomplete, hover docs, and inline validation in VS Code, JetBrains, Zed, and any other JSON-Schema-aware editor:

```json
{
  "$schema": "__DOCS_SITE__/schema/v1.json",
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Does awesome things across every agent"
}
```

## `@agentplugins/schema` package

The npm package bundles the JSON Schema, generated TypeScript types, and a ready-to-use [Ajv](https://ajv.js.org/) validator.

```bash
npm install @agentplugins/schema
```

### Validate a manifest

```typescript
import { validateManifest } from '@agentplugins/schema'

const { valid, errors } = validateManifest(manifest)

if (!valid) {
  for (const error of errors) {
    console.error(`${error.instancePath}: ${error.message}`)
  }
}
```

`validateManifest` returns `{ valid: boolean, errors: Ajv.ErrorObject[] }`. On a valid manifest, `valid` is `true` and `errors` is empty.

### Types

```typescript
import type { Manifest, Hook, Skill, MCPServerConfig } from '@agentplugins/schema'

const manifest: Manifest = {
  name: 'my-plugin',
  version: '1.0.0',
  description: 'Does awesome things across every agent',
}
```

## Schema highlights

The schema enforces the manifest contract. Highlights:

### `name`

```jsonc
{
  "type": "string",
  "pattern": "^[a-z][a-z0-9-]*$",
  "maxLength": 64
}
```

Kebab-case, lowercase, max 64 chars.

### `version`

```jsonc
{
  "type": "string",
  "pattern": "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-...)?$"
}
```

Full [semver](https://semver.org/) regex including pre-release and build metadata.

### `description`

```jsonc
{
  "type": "string",
  "minLength": 10
}
```

Minimum 10 characters.

### `targets`

```jsonc
{
  "type": "array",
  "items": {
    "type": "string",
    "enum": ["claude", "codex", "copilot", "gemini", "kimi", "opencode", "pimono"]
  }
}
```

Only the seven supported platforms.

### `hooks`

An object whose keys are the 19 universal hook names. Each value is a `{ matcher?, handler }` object whose `handler` is a `command`, `http`, or `reference` handler. See the [Hooks guide](/guide/hooks) for details.

### `additionalProperties: false`

The root object rejects unknown fields. This catches typos like `discription` or `verson` at validation time.

## Ajv usage example

If you'd rather bring your own Ajv instance:

```typescript
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import schema from '@agentplugins/schema/manifest.schema.json' with { type: 'json' }

const ajv = addFormats(new Ajv({ allErrors: true }))
const validate = ajv.compile(schema)

const ok = validate(manifest)
if (!ok) {
  console.error(validate.errors)
}
```

## Versioning

The schema follows SemVer. The `v1` series is backwards-compatible — fields may be added but never removed or renamed in a backwards-incompatible way. Breaking changes ship as `v2`.

::: tip
Pin to `__DOCS_SITE__/schema/v1.json` (not a specific commit) to pick up non-breaking additions automatically. Pin to the raw GitHub URL at a specific commit SHA if you need absolute reproducibility.
:::

## Next steps

- [Manifest reference](/guide/manifest) — what every field does.
- [Linting](/guide/linting) — the eight lint rules.
- [Adapters](/reference/adapters) — what each target platform emits.
