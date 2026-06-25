/**
 * convert: run a format ingestor and return the synthesized manifest + warnings.
 *
 * This is the primary tool. Agents call `convert` with a `format` and `source`
 * and receive a manifest they can validate, edit, and write via the other tools.
 */

import { existsSync, statSync } from 'node:fs';
import { defineTool, z } from './_helpers.js';
import { ingest } from '@agentplugins/ingest';
import { validateManifest } from '@agentplugins/schema';

const FORMATS = ['claude-code', 'codex', 'skills-sh'] as const;

export const convertTool = defineTool(
  {
    format: z.enum(FORMATS).describe('Which ingest format to run'),
    source: z.string().describe('Absolute path to the source directory'),
  },
  async ({ format, source }) => {
    if (!existsSync(source) || !statSync(source).isDirectory()) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: `Not a directory: ${source}` }, null, 2) }],
        isError: true,
      };
    }
    const result = ingest(format, source);
    const validation = validateManifest(result.manifest);
    const payload = {
      manifest: result.manifest,
      warnings: result.warnings,
      vendorFiles: result.vendorFiles.map((v) => ({ relativePath: v.relativePath, reason: v.reason })),
      schema: {
        valid: validation.valid,
        errors: validation.errors,
      },
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    };
  }
);
