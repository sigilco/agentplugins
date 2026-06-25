/**
 * verify_integrity: compute SHA-256 over a source path and verify it against
 * a known integrity string (e.g. from the manifest's `integrity` field).
 *
 * Currently computes the SHA-256 of the entire directory tree (file paths
 * joined with their content) for reproducibility. Lane B of the v0.3.0 P0 work
 * will replace this with a real tarball-based integrity hash that matches the
 * install-time verification path.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { defineTool, z } from './_helpers.js';

export const verifyIntegrityTool = defineTool(
  {
    source: z.string().describe('Absolute path to the source directory to hash'),
    expected: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/i, 'Must be in the form sha256:<64 hex chars>')
      .optional()
      .describe('Optional expected integrity string to compare against'),
  },
  async ({ source, expected }) => {
    if (!existsSync(source)) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: `Path not found: ${source}` }, null, 2) }],
        isError: true,
      };
    }
    const hash = hashDirectory(source);
    const actual = `sha256:${hash}`;
    const match = expected ? actual.toLowerCase() === expected.toLowerCase() : null;
    return {
      content: [{ type: 'text', text: JSON.stringify({ actual, expected: expected ?? null, match }, null, 2) }],
    };
  }
);

function existsSync(p: string): boolean {
  try { statSync(p); return true; } catch { return false; }
}

function hashDirectory(root: string): string {
  const hash = createHash('sha256');
  const files: string[] = [];
  walk(root, files);
  files.sort();
  for (const f of files) {
    const rel = f.slice(root.length + 1);
    hash.update(rel);
    hash.update('\0');
    hash.update(readFileSync(f));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.')) continue;
      walk(abs, out);
    } else if (entry.isFile()) {
      out.push(abs);
    }
  }
}
