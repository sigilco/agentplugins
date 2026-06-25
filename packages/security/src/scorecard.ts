/**
 * OpenSSF Scorecard wrapper.
 *
 * https://scorecard.dev — checks a GitHub repository against supply-chain
 * health criteria (branch protection, dependency update tooling, CI tests,
 * SAST, etc.) and returns a 0–10 score. The wrapper shells out to the
 * `scorecard` CLI; if it is not installed, returns a `skipped` result.
 */

import { spawnSync } from 'node:child_process';

export interface ScorecardResult {
  ran: boolean;
  skipped?: boolean;
  note?: string;
  /** Score on the 0–10 scale, or null when the scorecard CLI was missing. */
  score: number | null;
  /** Date of the last scorecard check (ISO date). */
  date?: string;
  /** Individual check results (only populated when `ran` is true). */
  checks: Array<{ name: string; score: number; reason?: string }>;
  raw?: string;
}

export function isScorecardAvailable(): boolean {
  const r = spawnSync('scorecard', ['--version'], { stdio: 'ignore' });
  return r.status === 0;
}

export function runScorecard(repo: string): ScorecardResult {
  if (!isScorecardAvailable()) {
    return {
      ran: false,
      skipped: true,
      note: '`scorecard` CLI is not on PATH; install it from https://github.com/ossf/scorecard for real supply-chain scoring. Returning null score.',
      score: null,
      checks: [],
    };
  }
  const r = spawnSync('scorecard', ['--repo', repo, '--format', 'json'], { encoding: 'utf-8' });
  const checks: ScorecardResult['checks'] = [];
  let score: number | null = null;
  let date: string | undefined;
  if (r.stdout) {
    try {
      const parsed = JSON.parse(r.stdout) as { date?: string; score?: number; checks?: Array<{ name: string; score: number; reason?: string }> };
      date = parsed.date;
      score = parsed.score ?? null;
      for (const c of parsed.checks ?? []) {
        checks.push({ name: c.name, score: c.score, reason: c.reason });
      }
    } catch {
      // fall through
    }
  }
  return {
    ran: true,
    score,
    date,
    checks,
    raw: r.stdout + (r.stderr ? `\n${r.stderr}` : ''),
  };
}
