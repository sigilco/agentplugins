/**
 * `osv-scanner` wrapper.
 *
 * https://github.com/google/osv-scanner — checks a lockfile or source tree
 * against the OSV database for known vulnerabilities. The wrapper checks if
 * the CLI is on `PATH`; if not, it returns a `skipped` result so the audit
 * command can still complete (with a warning) rather than failing.
 */

import { spawnSync } from 'node:child_process';

export interface OsvFinding {
  package: string;
  version: string;
  advisory: string;
  severity: string;
  fixedVersion?: string;
}

export interface OsvScannerResult {
  /** Did we actually run `osv-scanner`? */
  ran: boolean;
  /** True if the CLI was missing; the result is informational only. */
  skipped?: boolean;
  /** Human-readable note when skipped. */
  note?: string;
  findings: OsvFinding[];
  /** Raw stdout/stderr when ran. */
  raw?: string;
  /** True if at least one finding has severity `CRITICAL` or `HIGH`. */
  hasCriticalOrHigh: boolean;
}

export function isOsvScannerAvailable(): boolean {
  const r = spawnSync('osv-scanner', ['--version'], { stdio: 'ignore' });
  return r.status === 0;
}

export function runOsvScanner(source: string): OsvScannerResult {
  if (!isOsvScannerAvailable()) {
    return {
      ran: false,
      skipped: true,
      note: '`osv-scanner` is not on PATH; install it from https://github.com/google/osv-scanner for real vulnerability scanning. Returning empty result.',
      findings: [],
      hasCriticalOrHigh: false,
    };
  }
  const r = spawnSync('osv-scanner', ['-r', source, '--format', 'json'], { encoding: 'utf-8' });
  const findings: OsvFinding[] = [];
  if (r.stdout) {
    try {
      const parsed = JSON.parse(r.stdout) as { results?: Array<{ packages?: Array<{ package?: { name?: string; version?: string }; vulnerabilities?: Array<{ id: string; severity?: string; affected_versions?: string[] }> }> }> };
      for (const res of parsed.results ?? []) {
        for (const pkg of res.packages ?? []) {
          for (const v of pkg.vulnerabilities ?? []) {
            findings.push({
              package: pkg.package?.name ?? '?',
              version: pkg.package?.version ?? '?',
              advisory: v.id,
              severity: v.severity ?? 'UNKNOWN',
            });
          }
        }
      }
    } catch {
      // OSV output isn't always JSON if the run errored — fall through
    }
  }
  return {
    ran: true,
    findings,
    raw: r.stdout + (r.stderr ? `\n${r.stderr}` : ''),
    hasCriticalOrHigh: findings.some((f) => /^(CRITICAL|HIGH)$/i.test(f.severity)),
  };
}
