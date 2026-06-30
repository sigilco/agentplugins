/**
 * AgentPlugins Import Command
 *
 * `agentplugins import <format> <source>`
 *
 * Translates a community plugin source tree into an AgentPlugins v1 manifest.
 * Default mode writes `<source>/agentplugins.imported.json` next to the source
 * and prints warnings to stderr. With `--write`, the generated manifest is also
 * installed into the universal store via `installPlugin`.
 */

import { resolve, join } from 'node:path';
import { existsSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { ingest, type IngestFormat, type IngestResult } from '@agentplugins/ingest';
import { isValidManifest } from '@agentplugins/schema';
import { installPlugin, getStorePath } from '@agentplugins/core';
import { verifyIntegrity, evaluateManifestScripts } from '@agentplugins/security';
import { getCliLogger } from '../logger.js';

const logger = getCliLogger();

export interface ImportOptions {
  format: string;
  source: string;
  out?: string;
  write?: boolean;
  vendor?: boolean;
  quiet?: boolean;
}

const SUPPORTED_FORMATS: readonly IngestFormat[] = ['claude-code', 'codex', 'skills-sh'];

export async function importCommand(options: ImportOptions): Promise<void> {
  const format = options.format as IngestFormat;
  if (!SUPPORTED_FORMATS.includes(format)) {
    logger.error('Unknown format "{format}". Supported: {supported}', {
      format: options.format,
      supported: SUPPORTED_FORMATS.join(', '),
    });
    process.exit(2);
  }

  const source = resolve(options.source);
  if (!existsSync(source)) {
    logger.error('Source path does not exist: {source}', { source });
    process.exit(2);
  }

  logger.info('\n📥 Importing {format} plugin from {source}\n', { format, source });

  let result: IngestResult;
  try {
    result = ingest(format, source);
  } catch (err) {
    logger.error('Import failed: {msg}', { msg: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }

  // Schema-validate the synthesized manifest
  const valid = isValidManifest(result.manifest);
  if (!valid) {
    logger.warn('⚠  The synthesized manifest does not validate against the AgentPlugins v1 schema.');
    logger.info('   The output will still be written so you can fix the gaps manually.');
  }

  // Default destination: <source>/agentplugins.imported.json
  const outPath = options.out
    ? resolve(options.out)
    : join(source, 'agentplugins.imported.json');

  writeFileSync(outPath, JSON.stringify(result.manifest, null, 2) + '\n', 'utf-8');
  logger.info('✓ Manifest written to {path}', { path: outPath });

  // Vendor upstream files into <source>/.agentplugins-vendor/<relative-path>
  if (options.vendor !== false && result.vendorFiles.length > 0) {
    const vendorRoot = join(source, '.agentplugins-vendor');
    mkdirSync(vendorRoot, { recursive: true });
    for (const v of result.vendorFiles) {
      const dest = join(vendorRoot, v.relativePath);
      mkdirSync(resolve(dest, '..'), { recursive: true });
      try {
        copyFileSync(v.absolutePath, dest);
      } catch {
        // Non-fatal: vendor is best-effort
      }
    }
    logger.info('  Vendored {count} file{plural} into {root}', {
      count: result.vendorFiles.length,
      plural: result.vendorFiles.length === 1 ? '' : 's',
      root: vendorRoot,
    });
  }

  // Print warnings to stderr (or stdout in quiet mode)
  if (!options.quiet && result.warnings.length > 0) {
    logger.warn('\n⚠  {count} warning{plural} from ingestor:', {
      count: result.warnings.length,
      plural: result.warnings.length === 1 ? '' : 's',
    });
    for (const w of result.warnings) {
      const tag = w.severity === 'error' ? '[error]' : w.severity === 'warning' ? '[warn]' : '[info]';
      if (w.severity === 'error') {
        logger.error('  {tag} {code}: {message}', { tag, code: w.code, message: w.message });
      } else if (w.severity === 'warning') {
        logger.warn('  {tag} {code}: {message}', { tag, code: w.code, message: w.message });
      } else {
        logger.info('  {tag} {code}: {message}', { tag, code: w.code, message: w.message });
      }
      if (w.suggestion) logger.info('         → {suggestion}', { suggestion: w.suggestion });
    }
  }

  // --write: install into the universal store
  if (options.write) {
    const name = (result.manifest.name as string) ?? 'imported-plugin';
    const version = (result.manifest.version as string) ?? '0.0.0';

    // B17: verify pinned integrity (opt-in)
    const integrity = result.manifest.integrity as string | undefined;
    if (integrity && integrity.length > 0) {
      const { match, reason } = verifyIntegrity(source, integrity);
      if (!match) {
        logger.error('\nIntegrity check failed: {reason}', { reason });
        process.exit(1);
      }
    }

    // B18: evaluate lifecycle script policy
    const scriptCheck = evaluateManifestScripts(result.manifest as Record<string, unknown>, name);
    if (!scriptCheck.ok) {
      for (const issue of scriptCheck.issues) {
        const tag = issue.decision === 'deny' ? '[error]' : '[review]';
        if (issue.decision === 'deny') {
          logger.error('  {tag} {dependency} ({phase}): {command}', {
            tag,
            dependency: issue.dependency,
            phase: issue.phase,
            command: issue.command,
          });
        } else {
          logger.warn('  {tag} {dependency} ({phase}): {command}', {
            tag,
            dependency: issue.dependency,
            phase: issue.phase,
            command: issue.command,
          });
        }
        for (const r of issue.reasons) logger.info('         {reason}', { reason: r });
      }
      logger.error('\nRefusing to install: lifecycle script policy violation');
      process.exit(1);
    }

    logger.info('\nInstalling into store at {path}/{name} ...', { path: getStorePath(), name });
    try {
      installPlugin(source, {
        source: `import:${format}:${source}`,
        name,
        commit: '0000000000000000000000000000000000000000',
        manifestPath: 'agentplugins.imported.json',
        version,
      });
      logger.info('✓ Installed {name} v{version}', { name, version });
    } catch (err) {
      logger.error('Install failed: {msg}', { msg: err instanceof Error ? err.message : String(err) });
      process.exit(1);
    }
  } else {
    logger.info('\nRe-run with --write to install into the universal store.');
  }
}
