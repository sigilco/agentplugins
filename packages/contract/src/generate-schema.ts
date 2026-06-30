/**
 * Build-time script: generates manifest.schema.json from the zod schema.
 * Run after tsc: `node dist/generate-schema.js`
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { PluginManifestSchema } from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'manifest.schema.json');

const schema = z.toJSONSchema(PluginManifestSchema, {
  target: 'draft-07',
}) as Record<string, unknown>;

// z.toJSONSchema injects its own $schema; the wrapper below owns it.
delete schema.$schema;

const output = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://agentplugins.pages.dev/schema/v1.json',
  title: 'AgentPlugins Manifest',
  description: 'Universal plugin manifest for AI agent platforms. https://agentplugins.pages.dev/',
  $ref: '#/$defs/PluginManifest',
  $defs: {
    PluginManifest: schema,
  },
};

writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
console.log('[contract] manifest.schema.json generated →', outPath);
