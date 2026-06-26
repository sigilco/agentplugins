/**
 * Path and name sanitizers — shared across compile (codegen) and store (install).
 *
 * Every path that originates from untrusted plugin manifest content must pass
 * through these helpers before being used in file system operations.
 */

import { resolve, join, sep } from 'node:path';

const KEBAB_RE = /^[a-z][a-z0-9-]*$/;
const MAX_NAME_LEN = 64;

/**
 * Validates a plugin name or SKILL.md frontmatter name.
 * Rejects: non-kebab-case, `..`, absolute paths, slashes, names > 64 chars.
 * Returns the name unchanged on success; throws on violation.
 */
export function sanitizeName(name: unknown): string {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`Plugin name must be a non-empty string; got ${JSON.stringify(name)}`);
  }
  if (name.length > MAX_NAME_LEN) {
    throw new Error(`Plugin name "${name}" exceeds max length of ${MAX_NAME_LEN} chars`);
  }
  if (!KEBAB_RE.test(name)) {
    throw new Error(
      `Plugin name "${name}" must be kebab-case (lowercase letter, then lowercase letters/digits/hyphens)`
    );
  }
  // Belt-and-suspenders: reject traversal sequences
  if (name.includes('..') || name.includes('/') || name.includes(sep)) {
    throw new Error(`Plugin name "${name}" contains path traversal characters`);
  }
  return name;
}

/**
 * Joins `base` and `untrusted` and asserts the result is inside `base`.
 * Rejects absolute `untrusted` paths and `..` traversal.
 * Returns the resolved absolute path on success; throws on violation.
 */
export function sanitizeJoin(base: string, untrusted: string): string {
  if (typeof untrusted !== 'string' || untrusted.length === 0) {
    throw new Error(`Path must be a non-empty string; got ${JSON.stringify(untrusted)}`);
  }

  // Reject absolute paths — only relative sub-paths allowed
  if (untrusted.startsWith('/') || /^[A-Za-z]:[/\\]/.test(untrusted)) {
    throw new Error(`Path "${untrusted}" must be relative, not absolute`);
  }

  // Resolve and assert containment
  const resolvedBase = resolve(base);
  const candidate = resolve(join(resolvedBase, untrusted));

  if (!candidate.startsWith(resolvedBase + sep) && candidate !== resolvedBase) {
    throw new Error(
      `Path "${untrusted}" resolves outside of base directory "${resolvedBase}" → "${candidate}"`
    );
  }

  return candidate;
}
