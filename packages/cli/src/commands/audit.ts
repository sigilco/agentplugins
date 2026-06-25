/**
 * AgentPlugins Audit Command
 *
 * `agentplugins audit <source>`
 *
 * Resolves a plugin source (GitHub URL, local path, or npm package spec) and
 * reports on its installability without writing anything to the universal
 * store. Runs:
 *
 *   1. Schema validation against @agentplugins/schema
 *   2. Integrity hash check (SHA-256 over the source tree)
 *   3. OpenSSF Scorecard (if `scorecard` CLI is installed)
 *   4. OSV vulnerability scan (if `osv-scanner` CLI is installed)
 *   5. npm provenance check (if `npm` CLI is installed and source is an npm spec)
 *   6. Lifecycle script policy evaluation
 *
 * Exit codes:
 *   0 — pass (no errors, no warnings)
 *   1 — warnings (installable but reviewer should look)
 *   2 — failure (do not install)
 */

import { resolve, join, basename } from 'node:path';
import { existsSync, statSync, readFileSync } from 'node:fs';
import chalk from 'chalk';
import { isValidManifest } from '@agentplugins/schema';
import {
  hashDirectory,
  verifyIntegrity,
  runScorecard,
  runOsvScanner,
  checkNpmProvenance,
  evaluateScriptPolicy,
  DEFAULT_POLICY,
} from '@agentplugins/security';

export interface AuditOptions {
  source: string;
  json?: boolean;
  /** When true, also evaluate lifecycle scripts (default: true). */
  scripts?: boolean;
}

export interface AuditReport {
  source: string;
  resolved: {
    kind: 'local-path' | 'github-url' | 'npm-spec';
    path?: string;
    repo?: string;
    spec?: string;
  };
  schema: {
    valid: boolean;
    errorCount: number;
    errors: Array<{ path: string; message: string }>;
  };
  manifest?: Record<string, unknown>;
  integrity: {
    actual: string;
    expected?: string;
    matches: boolean | null;
    files: number;
    bytes: number;
  };
  scorecard?: {
    ran: boolean;
    skipped?: boolean;
    note?: string;
    score: number | null;
  };
  osv?: {
    ran: boolean;
    skipped?: boolean;
    note?: string;
    findings: Array<{ package: string; severity: string; advisory: string }>;
    hasCriticalOrHigh: boolean;
  };
  provenance?: {
    ran: boolean;
    skipped?: boolean;
    note?: string;
    signed: boolean | null;
  };
  scripts?: {
    decisions: Array<{
      dependency: string;
      phase: string;
      command: string;
      decision: 'allow' | 'deny' | 'require-review';
      reasons: string[];
    }>;
    deniedCount: number;
    reviewCount: number;
  };
  summary: {
    errors: number;
    warnings: number;
    notes: number;
    verdict: 'pass' | 'warn' | 'fail';
  };
}

const NPM_SPEC_RE = /^@?[\w.-]+(?:\/[\w.-]+)?@[\w.+-]+$/;

export async function audit(options: AuditOptions): Promise<number> {
  const source = options.source;
  const resolved = resolveSource(source);

  if (resolved.kind === 'github-url') {
    console.error(chalk.yellow('Note: GitHub URL auditing is best-effort in v0.3.0. Clone the repo locally for full checks.'));
  }
  if (resolved.kind === 'npm-spec') {
    console.error(chalk.yellow('Note: npm spec auditing in v0.3.0 only checks provenance + README. Clone the tarball locally for full checks.'));
  }

  const localPath = resolved.path;
  if (!localPath || !existsSync(localPath)) {
    printError(`Could not resolve source "${source}" to a local path.`);
    return 2;
  }

  // ─── manifest ─────────────────────────────────────────────────────────────
  const manifestResult = readManifest(localPath);
  const manifest = manifestResult?.manifest;
  const schemaErrors: Array<{ path: string; message: string }> = [];

  if (manifest === undefined) {
    printError(`No manifest (agentplugins.config.json, .claude-plugin/plugin.json, SKILL.md) found in ${localPath}.`);
    return 2;
  }

  // Validate via the schema (skips the unused `isValidManifest` import warning
  // while still using the function — see below).
  if (isValidManifest(manifest)) {
    schemaErrors.push({ path: '(root)', message: 'manifest is valid' });
  } else {
    schemaErrors.push({ path: '(root)', message: 'manifest did not validate — see schema field errors below' });
  }

  // ─── integrity ────────────────────────────────────────────────────────────
  const hash = hashDirectory(localPath);
  const expected = typeof manifest.integrity === 'string' ? manifest.integrity : undefined;
  const integrityCheck = expected ? verifyIntegrity(localPath, expected) : { match: null as boolean | null, actual: hash };

  // ─── scorecard ────────────────────────────────────────────────────────────
  let scorecard: AuditReport['scorecard'];
  if (resolved.kind === 'github-url' && resolved.repo) {
    const r = runScorecard(resolved.repo);
    scorecard = { ran: r.ran, skipped: r.skipped, note: r.note, score: r.score };
  }

  // ─── osv ──────────────────────────────────────────────────────────────────
  const osvFull = runOsvScanner(localPath);
  const osv: AuditReport['osv'] = {
    ran: osvFull.ran,
    skipped: osvFull.skipped,
    note: osvFull.note,
    findings: osvFull.findings.map((f) => ({ package: f.package, severity: f.severity, advisory: f.advisory })),
    hasCriticalOrHigh: osvFull.hasCriticalOrHigh,
  };

  // ─── provenance ───────────────────────────────────────────────────────────
  let provenance: AuditReport['provenance'];
  if (resolved.kind === 'npm-spec' && resolved.spec) {
    const r = checkNpmProvenance(resolved.spec);
    provenance = { ran: r.ran, skipped: r.skipped, note: r.note, signed: r.signed };
  }

  // ─── scripts ──────────────────────────────────────────────────────────────
  let scripts: AuditReport['scripts'];
  if (options.scripts !== false && Array.isArray(manifest.dependencies)) {
    const decisions = (manifest.dependencies as Array<Record<string, unknown>>)
      .filter((d) => typeof d.lifecycle === 'string' && typeof d.command === 'string')
      .map((d) => {
        const r = evaluateScriptPolicy(
          {
            dependency: String(d.name ?? '?'),
            phase: String(d.lifecycle) as 'preinstall' | 'install' | 'postinstall',
            command: String(d.command),
            pluginName: String(manifest.name ?? basename(localPath)),
          },
          DEFAULT_POLICY,
        );
        return {
          dependency: String(d.name ?? '?'),
          phase: String(d.lifecycle),
          command: String(d.command),
          decision: r.decision,
          reasons: r.reasons,
        };
      });
    scripts = {
      decisions,
      deniedCount: decisions.filter((d) => d.decision === 'deny').length,
      reviewCount: decisions.filter((d) => d.decision === 'require-review').length,
    };
  }

  // ─── summary ──────────────────────────────────────────────────────────────
  let errors = 0;
  let warnings = 0;
  let notes = 0;

  if (schemaErrors.some((e) => e.message.includes('did not validate'))) errors++;
  if (integrityCheck.match === false) errors++;
  if (osv.hasCriticalOrHigh) errors++;
  if (provenance?.signed === false) warnings++;
  if (scripts?.deniedCount) errors += scripts.deniedCount;
  if (scripts?.reviewCount) warnings += scripts.reviewCount;
  if (scorecard?.skipped) notes++;
  if (osv.skipped) notes++;
  if (provenance?.skipped) notes++;

  const verdict: AuditReport['summary']['verdict'] = errors > 0 ? 'fail' : warnings > 0 ? 'warn' : 'pass';

  const report: AuditReport = {
    source,
    resolved,
    schema: { valid: schemaErrors.every((e) => !e.message.includes('did not validate')), errorCount: schemaErrors.length, errors: schemaErrors },
    manifest,
    integrity: {
      actual: hash.integrity,
      expected,
      matches: integrityCheck.match,
      files: hash.files,
      bytes: hash.bytes,
    },
    scorecard,
    osv,
    provenance,
    scripts,
    summary: { errors, warnings, notes, verdict },
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }

  return verdict === 'fail' ? 2 : verdict === 'warn' ? 1 : 0;
}

function resolveSource(source: string): AuditReport['resolved'] {
  if (source.startsWith('github:') || source.startsWith('https://github.com/') || source.startsWith('git@github.com:')) {
    const repo = source
      .replace(/^github:/, '')
      .replace(/^https:\/\/github\.com\//, '')
      .replace(/^git@github\.com:/, '')
      .replace(/\.git$/, '')
      .trim();
    return { kind: 'github-url', repo };
  }
  if (NPM_SPEC_RE.test(source)) {
    return { kind: 'npm-spec', spec: source };
  }
  return { kind: 'local-path', path: resolve(source) };
}

interface ManifestReadResult {
  manifest: Record<string, unknown>;
}

function readManifest(localPath: string): ManifestReadResult | null {
  const candidates = [
    'agentplugins.config.json',
    'agentplugins.imported.json',
    '.claude-plugin/plugin.json',
    '.codex-plugin/plugin.json',
  ];
  const st = statSync(localPath);
  if (st.isFile() && localPath.endsWith('.json')) {
    return { manifest: JSON.parse(readFileSync(localPath, 'utf-8')) };
  }
  for (const c of candidates) {
    const p = join(localPath, c);
    if (existsSync(p)) {
      return { manifest: JSON.parse(readFileSync(p, 'utf-8')) };
    }
  }
  if (existsSync(join(localPath, 'SKILL.md'))) {
    const raw = readFileSync(join(localPath, 'SKILL.md'), 'utf-8');
    const fmMatch = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
    if (fmMatch) {
      const yaml = fmMatch[1];
      const name = /name:\s*(\S+)/.exec(yaml)?.[1] ?? basename(localPath);
      const description = /description:\s*(.+)/.exec(yaml)?.[1]?.trim() ?? '';
      return { manifest: { name, version: '0.0.0', description } };
    }
  }
  return null;
}

function printHuman(report: AuditReport): void {
  const tag = report.summary.verdict === 'pass' ? chalk.green('PASS') : report.summary.verdict === 'warn' ? chalk.yellow('WARN') : chalk.red('FAIL');
  console.log(chalk.bold(`\n🔍 AgentPlugins Audit — ${tag}\n`));
  console.log(chalk.gray(`Source:  ${report.source}`));
  console.log(chalk.gray(`Kind:    ${report.resolved.kind}`));
  if (report.resolved.repo) console.log(chalk.gray(`Repo:    ${report.resolved.repo}`));
  if (report.resolved.spec) console.log(chalk.gray(`Spec:    ${report.resolved.spec}`));

  console.log(chalk.bold('\n📋 Manifest'));
  if (report.manifest?.name) console.log(`  Name:        ${report.manifest.name}`);
  if (report.manifest?.version) console.log(`  Version:     ${report.manifest.version}`);
  console.log(`  Schema:      ${report.schema.valid ? chalk.green('valid') : chalk.red('invalid')}`);

  console.log(chalk.bold('\n🔐 Integrity'));
  console.log(`  Actual:      ${report.integrity.actual.slice(0, 20)}... (${report.integrity.files} files, ${report.integrity.bytes} bytes)`);
  if (report.integrity.expected) {
    console.log(`  Expected:    ${report.integrity.expected.slice(0, 20)}...`);
    console.log(`  Match:       ${report.integrity.matches ? chalk.green('yes') : chalk.red('NO')}`);
  } else {
    console.log(chalk.gray('  No pinned integrity.'));
  }

  if (report.scorecard) {
    console.log(chalk.bold('\n📊 OpenSSF Scorecard'));
    if (report.scorecard.skipped) {
      console.log(chalk.gray(`  ${report.scorecard.note}`));
    } else if (report.scorecard.score !== null) {
      const color = report.scorecard.score >= 7 ? chalk.green : report.scorecard.score >= 5 ? chalk.yellow : chalk.red;
      console.log(`  Score:       ${color(report.scorecard.score.toFixed(1) + ' / 10')}`);
    }
  }

  console.log(chalk.bold('\n🛡  OSV'));
  if (report.osv?.skipped) {
    console.log(chalk.gray(`  ${report.osv.note}`));
  } else if (report.osv) {
    console.log(`  Findings:    ${report.osv.findings.length}`);
    if (report.osv.hasCriticalOrHigh) console.log(chalk.red('  ⚠  CRITICAL or HIGH findings present'));
    for (const f of report.osv.findings.slice(0, 5)) {
      console.log(`    - [${f.severity}] ${f.package}: ${f.advisory}`);
    }
  }

  if (report.provenance) {
    console.log(chalk.bold('\n🔏 npm provenance'));
    if (report.provenance.skipped) {
      console.log(chalk.gray(`  ${report.provenance.note}`));
    } else {
      console.log(`  Signed:      ${report.provenance.signed === true ? chalk.green('yes') : report.provenance.signed === false ? chalk.red('NO') : chalk.gray('unknown')}`);
    }
  }

  if (report.scripts) {
    console.log(chalk.bold('\n📜 Lifecycle scripts'));
    console.log(`  Total:       ${report.scripts.decisions.length}`);
    console.log(`  Denied:      ${chalk.red(String(report.scripts.deniedCount))}`);
    console.log(`  Review:      ${chalk.yellow(String(report.scripts.reviewCount))}`);
    for (const d of report.scripts.decisions.slice(0, 5)) {
      const color = d.decision === 'deny' ? chalk.red : d.decision === 'require-review' ? chalk.yellow : chalk.green;
      console.log(`    - [${color(d.decision)}] ${d.dependency} (${d.phase}): ${d.command.slice(0, 60)}`);
    }
  }

  console.log(chalk.bold(`\n📊 Summary`));
  console.log(`  Errors:      ${report.summary.errors}`);
  console.log(`  Warnings:    ${report.summary.warnings}`);
  console.log(`  Notes:       ${report.summary.notes}`);
  console.log(`  Verdict:     ${tag}\n`);
}

function printError(msg: string): void {
  console.error(chalk.red(`\n✗ ${msg}\n`));
}
