/**
 * npm provenance wrapper.
 *
 * Checks whether a given npm package version was published with a valid
 * OIDC-signed provenance attestation (Sigstore). The wrapper shells out to
 * `npm audit signatures`; if the CLI is not available, falls back to a stub
 * that returns `unknown`.
 *
 * In production you should also verify the attestation against the
 * sigstore-tuf root, but that requires pulling the trust root — out of scope
 * for v0.3.0.
 */

import { spawnSync } from 'node:child_process';

export interface NpmProvenanceResult {
  ran: boolean;
  skipped?: boolean;
  note?: string;
  /** The npm package spec (e.g. `@agentplugins/core@0.3.0`). */
  spec: string;
  /** True if the package has a valid signature. */
  signed: boolean | null;
  /** List of keys that signed the package, if any. */
  signingKeys?: string[];
  raw?: string;
}

export function isNpmProvenanceAvailable(): boolean {
  const r = spawnSync('npm', ['--version'], { stdio: 'ignore' });
  return r.status === 0;
}

export function checkNpmProvenance(spec: string): NpmProvenanceResult {
  if (!isNpmProvenanceAvailable()) {
    return {
      ran: false,
      skipped: true,
      note: '`npm` CLI is not on PATH; cannot verify provenance. Returning `unknown`.',
      spec,
      signed: null,
    };
  }
  const r = spawnSync('npm', ['audit', 'signatures', '--json'], { encoding: 'utf-8', timeout: 5_000 });
  let signed: boolean | null = null;
  const signingKeys: string[] = [];
  if (r.stdout) {
    try {
      const parsed = JSON.parse(r.stdout) as Record<string, { signatures?: Array<{ keyid: string; valid: boolean }> }>;
      const entry = parsed[spec];
      if (entry?.signatures) {
        signed = entry.signatures.some((s) => s.valid);
        for (const s of entry.signatures) if (s.valid) signingKeys.push(s.keyid);
      }
    } catch {
      // fall through
    }
  }
  return {
    ran: true,
    spec,
    signed,
    signingKeys,
    raw: r.stdout + (r.stderr ? `\n${r.stderr}` : ''),
  };
}
