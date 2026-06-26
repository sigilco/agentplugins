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
import chalk from 'chalk';
import { ingest, type IngestFormat, type IngestResult } from '@agentplugins/ingest';
import { isValidManifest } from '@agentplugins/schema';
import { installPlugin, getStorePath } from '@agentplugins/core';
import { verifyIntegrity, evaluateManifestScripts } from '@agentplugins/security';

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
    console.error(chalk.red(`Unknown format "${options.format}". Supported: ${SUPPORTED_FORMATS.join(', ')}`));
    process.exit(2);
  }

  const source = resolve(options.source);
  if (!existsSync(source)) {
    console.error(chalk.red(`Source path does not exist: ${source}`));
    process.exit(2);
  }

  console.log(chalk.bold(`\n📥 Importing ${format} plugin from ${source}\n`));

  let result: IngestResult;
  try {
    result = ingest(format, source);
  } catch (err) {
    console.error(chalk.red('Import failed:'), err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Schema-validate the synthesized manifest
  const valid = isValidManifest(result.manifest);
  if (!valid) {
    console.error(chalk.yellow('⚠  The synthesized manifest does not validate against the AgentPlugins v1 schema.'));
    console.error(chalk.gray('   The output will still be written so you can fix the gaps manually.'));
  }

  // Default destination: <source>/agentplugins.imported.json
  const outPath = options.out
    ? resolve(options.out)
    : join(source, 'agentplugins.imported.json');

  writeFileSync(outPath, JSON.stringify(result.manifest, null, 2) + '\n', 'utf-8');
  console.log(chalk.green(`✓ Manifest written to ${outPath}`));

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
    console.log(chalk.gray(`  Vendored ${result.vendorFiles.length} file${result.vendorFiles.length === 1 ? '' : 's'} into ${vendorRoot}`));
  }

  // Print warnings to stderr (or stdout in quiet mode)
  if (!options.quiet && result.warnings.length > 0) {
    console.error(chalk.yellow(`\n⚠  ${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'} from ingestor:`));
    for (const w of result.warnings) {
      const tag = w.severity === 'error' ? chalk.red('[error]') : w.severity === 'warning' ? chalk.yellow('[warn]') : chalk.gray('[info]');
      console.error(`  ${tag} ${w.code}: ${w.message}`);
      if (w.suggestion) console.error(chalk.gray(`         → ${w.suggestion}`));
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
        console.error(chalk.red(`\nIntegrity check failed: ${reason}`));
        process.exit(1);
      }
    }

    // B18: evaluate lifecycle script policy
    const scriptCheck = evaluateManifestScripts(result.manifest as Record<string, unknown>, name);
    if (!scriptCheck.ok) {
      for (const issue of scriptCheck.issues) {
        const tag = issue.decision === 'deny' ? chalk.red('[error]') : chalk.yellow('[review]');
        console.error(`  ${tag} ${issue.dependency} (${issue.phase}): ${issue.command}`);
        for (const r of issue.reasons) console.error(chalk.gray(`         ${r}`));
      }
      console.error(chalk.red('\nRefusing to install: lifecycle script policy violation'));
      process.exit(1);
    }

    console.log(chalk.blue(`\nInstalling into store at ${getStorePath()}/${name} ...`));
    try {
      installPlugin(source, {
        source: `import:${format}:${source}`,
        name,
        commit: '0000000000000000000000000000000000000000',
        manifestPath: 'agentplugins.imported.json',
        version,
      });
      console.log(chalk.green(`✓ Installed ${name} v${version}`));
    } catch (err) {
      console.error(chalk.red('Install failed:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  } else {
    console.log(chalk.gray('\nRe-run with --write to install into the universal store.'));
  }
}
