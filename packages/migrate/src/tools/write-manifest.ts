/**
 * write_manifest: write a manifest object to a destination path.
 *
 * Agents should call `convert` first, review the manifest + warnings, edit the
 * object in conversation, and then call `write_manifest`. The tool refuses to
 * overwrite an existing file unless `overwrite: true`.
 */

import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineTool, z } from './_helpers.js';
import { validateManifest } from '@agentplugins/schema';

export const writeManifestTool = defineTool(
  {
    destination: z.string().describe('Absolute path to write the manifest to'),
    manifest: z.record(z.string(), z.unknown()).describe('The manifest object to write'),
    overwrite: z.boolean().default(false).describe('Overwrite an existing file'),
  },
  async ({ destination, manifest, overwrite }) => {
    const dest = resolve(destination);
    if (existsSync(dest) && !overwrite) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: `File exists: ${dest}. Pass overwrite: true to replace it.` }, null, 2) }],
        isError: true,
      };
    }
    const validation = validateManifest(manifest);
    if (!validation.valid) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'Manifest does not validate against the AgentPlugins v1 schema.', schemaErrors: validation.errors }, null, 2) }],
        isError: true,
      };
    }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
    return {
      content: [{ type: 'text', text: JSON.stringify({ wrote: dest, bytes: JSON.stringify(manifest).length }, null, 2) }],
    };
  }
);
