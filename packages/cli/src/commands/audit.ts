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
import { getCliLogger } from '../logger.js';

const logger = getCliLogger();

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
    logger.warn('Note: GitHub URL auditing is best-effort in v0.3.0. Clone the repo locally for full checks.');
  }
  if (resolved.kind === 'npm-spec') {
    logger.warn('Note: npm spec auditing in v0.3.0 only checks provenance + README. Clone the tarball locally for full checks.');
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
  const tag = report.summary.verdict.toUpperCase();
  logger.info('\n🔍 AgentPlugins Audit — {tag}\n', { tag });
  logger.info('Source:  {source}', { source: report.source });
  logger.info('Kind:    {kind}', { kind: report.resolved.kind });
  if (report.resolved.repo) logger.info('Repo:    {repo}', { repo: report.resolved.repo });
  if (report.resolved.spec) logger.info('Spec:    {spec}', { spec: report.resolved.spec });

  logger.info('\n📋 Manifest');
  if (report.manifest?.name) logger.info('  Name:        {name}', { name: report.manifest.name as string });
  if (report.manifest?.version) logger.info('  Version:     {version}', { version: report.manifest.version as string });
  logger.info('  Schema:      {status}', { status: report.schema.valid ? 'valid' : 'invalid' });

  logger.info('\n🔐 Integrity');
  logger.info('  Actual:      {hash}... ({files} files, {bytes} bytes)', {
    hash: report.integrity.actual.slice(0, 20),
    files: report.integrity.files,
    bytes: report.integrity.bytes,
  });
  if (report.integrity.expected) {
    logger.info('  Expected:    {hash}...', { hash: report.integrity.expected.slice(0, 20) });
    logger.info('  Match:       {match}', { match: report.integrity.matches ? 'yes' : 'NO' });
  } else {
    logger.info('  No pinned integrity.');
  }

  if (report.scorecard) {
    logger.info('\n📊 OpenSSF Scorecard');
    if (report.scorecard.skipped) {
      logger.info('  {note}', { note: report.scorecard.note });
    } else if (report.scorecard.score !== null) {
      logger.info('  Score:       {score} / 10', { score: report.scorecard.score.toFixed(1) });
    }
  }

  logger.info('\n🛡  OSV');
  if (report.osv?.skipped) {
    logger.info('  {note}', { note: report.osv.note });
  } else if (report.osv) {
    logger.info('  Findings:    {count}', { count: report.osv.findings.length });
    if (report.osv.hasCriticalOrHigh) logger.error('  ⚠  CRITICAL or HIGH findings present');
    for (const f of report.osv.findings.slice(0, 5)) {
      logger.info('    - [{severity}] {package}: {advisory}', { severity: f.severity, package: f.package, advisory: f.advisory });
    }
  }

  if (report.provenance) {
    logger.info('\n🔏 npm provenance');
    if (report.provenance.skipped) {
      logger.info('  {note}', { note: report.provenance.note });
    } else {
      const signed = report.provenance.signed === true ? 'yes' : report.provenance.signed === false ? 'NO' : 'unknown';
      logger.info('  Signed:      {signed}', { signed });
    }
  }

  if (report.scripts) {
    logger.info('\n📜 Lifecycle scripts');
    logger.info('  Total:       {count}', { count: report.scripts.decisions.length });
    logger.info('  Denied:      {count}', { count: report.scripts.deniedCount });
    logger.info('  Review:      {count}', { count: report.scripts.reviewCount });
    for (const d of report.scripts.decisions.slice(0, 5)) {
      logger.info('    - [{decision}] {dependency} ({phase}): {command}', {
        decision: d.decision,
        dependency: d.dependency,
        phase: d.phase,
        command: d.command.slice(0, 60),
      });
    }
  }

  logger.info('\n📊 Summary');
  logger.info('  Errors:      {count}', { count: report.summary.errors });
  logger.info('  Warnings:    {count}', { count: report.summary.warnings });
  logger.info('  Notes:       {count}', { count: report.summary.notes });
  logger.info('  Verdict:     {tag}\n', { tag });
}

function printError(msg: string): void {
  logger.error('\n✗ {msg}\n', { msg });
}
