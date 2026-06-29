/**
 * Build-time script: generates manifest.schema.json from the zod schema.
 * Run after tsc: `node dist/generate-schema.js`
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { PluginManifestSchema } from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'manifest.schema.json');

const schema = zodToJsonSchema(PluginManifestSchema, {
  name: 'PluginManifest',
  $refStrategy: 'none',
  definitionPath: '$defs',
  markdownDescription: true,
  errorMessages: false,
});

const output = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://agentplugins.pages.dev/schema/v1.json',
  title: 'AgentPlugins Manifest',
  description: 'Universal plugin manifest for AI agent platforms. https://agentplugins.pages.dev/',
  ...schema,
};

writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
console.log('[contract] manifest.schema.json generated →', outPath);
