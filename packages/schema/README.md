# @agentplugins/schema

JSON Schema + TypeScript types + Ajv validators for the **AgentPlugins manifest**. The public contract for the ecosystem.

## Install

```bash
npm install @agentplugins/schema
```

## Usage

### Validate a manifest

```ts
import { validateManifest, isValidManifest } from '@agentplugins/schema';

const manifest = {
  name: 'my-plugin',
  version: '1.0.0',
  description: 'Does something useful',
};

const result = validateManifest(manifest);
if (!result.valid) {
  for (const error of result.errors) {
    console.error(`${error.path}: ${error.message}`);
  }
}
```

### Type guard

```ts
import { isValidManifest, type ManifestSchema } from '@agentplugins/schema';

function process(data: unknown) {
  if (isValidManifest(data)) {
    // data is typed as ManifestSchema
  }
}
```

### Access the raw schema

```ts
import { manifestSchema, HOSTED_SCHEMA_URL } from '@agentplugins/schema';
```

### Editor autocomplete

Add `"$schema"` to your manifest file for autocomplete in VS Code, JetBrains, and any JSON-Schema-aware editor:

```json
{
  "$schema": "https://agentplugins.pages.dev/schema/v1.json",
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Does something useful"
}
```

## Exports

| Export | Description |
|---|---|
| `manifestSchema` | The JSON Schema object (draft-07) |
| `adapterSchema` | The adapter ABI JSON Schema |
| `agentPaths` | Agent path registry (well-known skill paths) |
| `validateManifest(data)` | Returns `{ valid, errors }` |
| `isValidManifest(data)` | Type guard — `data is ManifestSchema` |
| `getValidator()` | Returns a cached Ajv instance |
| `HOSTED_SCHEMA_URL` | `https://agentplugins.pages.dev/schema/v1.json` |
| `SCHEMA_VERSION` | `1` |

## Schemas

Published copies live in `schemas/`. Canonical source: [`spec/v1/`](../../spec/v1/). Keep in sync via the release process.

## License

MIT
