/**
 * Integrity hashing.
 *
 * Computes a deterministic SHA-256 over a directory tree (file paths joined
 * with their content, sorted alphabetically) so two clones of the same source
 * always hash identically. Used by:
 *
 *   - `agentplugins audit` — verify the manifest's `integrity` field matches
 *     the source the user is about to install.
 *   - `agentplugins add` — refuse to install if a pinned integrity is set and
 *     the source has drifted.
 *   - `@agentplugins/migrate` `verify_integrity` MCP tool.
 *
 * Output is always formatted as `sha256:<64 hex chars>` to match the
 * AgentPlugins v1 manifest's `integrity` field schema.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface IntegrityResult {
  /** Formatted as `sha256:<64 hex chars>` — matches the manifest schema. */
  integrity: string;
  /** Raw SHA-256 hex digest. */
  digest: string;
  /** Number of files hashed. */
  files: number;
  /** Total bytes hashed. */
  bytes: number;
}

export function formatIntegrity(digest: string): string {
  return `sha256:${digest.toLowerCase()}`;
}

export function parseIntegrity(integrity: string): { algorithm: 'sha256'; digest: string } | null {
  const m = /^sha256:([a-f0-9]{64})$/i.exec(integrity);
  if (!m) return null;
  return { algorithm: 'sha256', digest: m[1].toLowerCase() };
}

export function hashFile(path: string): string {
  const hash = createHash('sha256');
  hash.update(readFileSync(path));
  return hash.digest('hex');
}

export function hashDirectory(root: string): IntegrityResult {
  const files: string[] = [];
  walk(root, files);
  files.sort();

  const hash = createHash('sha256');
  let bytes = 0;
  for (const f of files) {
    const rel = f.slice(root.length + 1).replace(/\\/g, '/');
    hash.update(rel);
    hash.update('\0');
    const buf = readFileSync(f);
    hash.update(buf);
    hash.update('\0');
    bytes += buf.length;
  }

  const digest = hash.digest('hex');
  return {
    integrity: formatIntegrity(digest),
    digest,
    files: files.length,
    bytes,
  };
}

export function verifyIntegrity(root: string, expected: string): { match: boolean; actual: IntegrityResult; reason?: string } {
  const parsed = parseIntegrity(expected);
  if (!parsed) {
    return {
      match: false,
      actual: { integrity: expected, digest: '', files: 0, bytes: 0 },
      reason: `Expected integrity "${expected}" is not in the form "sha256:<64 hex chars>"`,
    };
  }
  const actual = hashDirectory(root);
  return {
    match: actual.digest === parsed.digest,
    actual,
    reason: actual.digest === parsed.digest ? undefined : 'SHA-256 of source tree does not match the pinned integrity.',
  };
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
      walk(abs, out);
    } else if (entry.isFile()) {
      out.push(abs);
    }
  }
}
