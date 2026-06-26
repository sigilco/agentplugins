#!/usr/bin/env node
/**
 * AgentPlugins CLI
 *
 * Build AI agent plugins once, ship to any harness.
 *
 * Distribution commands:
 *   agentplugins add <github-url>       # Install a plugin to the store + all agents
 *   agentplugins setup <name>             # Run an installed plugin's setup script
 *   agentplugins remove <name>            # Remove a plugin
 *   agentplugins list                   # List installed plugins
 *   agentplugins update [name]          # Update plugin(s) from source
 *   agentplugins info <name>            # Show plugin details
 *   agentplugins doctor                 # Run diagnostics
 *   agentplugins import <fmt> <src>     # Translate Claude/Codex/Skills.sh → AgentPlugins
 *
 * Codegen commands:
 *   agentplugins build                  # Build plugin for target platforms
 *   agentplugins validate               # Validate plugin without building
 *   agentplugins init                   # Scaffold a new plugin (interactive)
 *   agentplugins lint                   # Static analysis of plugin manifest
 *   agentplugins preview                # Preview compile output without writing
 */

import { cac } from 'cac';
import chalk from 'chalk';
import pkg from '../package.json' with { type: 'json' };
import { build } from './commands/build.js';
import { validate } from './commands/validate.js';
import { init } from './commands/init.js';
import { lint } from './commands/lint.js';
import { preview } from './commands/preview.js';
import { add } from './commands/add.js';
import { setup } from './commands/setup.js';
import { remove } from './commands/remove.js';
import { list } from './commands/list.js';
import { update } from './commands/update.js';
import { info } from './commands/info.js';
import { doctor } from './commands/doctor.js';
import { importCommand } from './commands/import.js';
import { audit } from './commands/audit.js';
import { loadConfig } from './config.js';

const cli = cac('agentplugins');

// ─── Distribution Commands ───────────────────────────────────────────────────

cli
  .command('add <source>', 'Install a plugin from GitHub to the store + all agents')
  .option('-y, --yes', 'Skip the setup trust prompt (still denylist-gated)')
  .option('--no-setup', 'Do not run any setup script after install')
  .action(async (source: string, options) => {
    try {
      await add({ source, yes: options.yes, noSetup: options.setup === false });
    } catch (err) {
      console.error(chalk.red('Add failed:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

cli
  .command('setup <name>', "Run an installed plugin's setup script (re-runnable)")
  .option('-f, --force', 'Re-prompt even if the setup command is unchanged/trusted')
  .option('-y, --yes', 'Skip the trust prompt (still denylist-gated)')
  .action(async (name: string, options) => {
    try {
      await setup({ name, force: options.force, yes: options.yes });
    } catch (err) {
      console.error(chalk.red('Setup failed:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

cli
  .command('remove <name>', 'Remove a plugin from the store and unlink all symlinks')
  .option('-f, --force', 'Skip confirmation', { default: false })
  .action(async (name: string, options) => {
    try {
      await remove({ name, force: options.force });
    } catch (err) {
      console.error(chalk.red('Remove failed:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

cli
  .command('list', 'List installed plugins')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await list({ json: options.json });
    } catch (err) {
      console.error(chalk.red('List failed:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

cli
  .command('update [name]', 'Update plugin(s) from source')
  .option('-a, --all', 'Update all installed plugins')
  .action(async (name: string | undefined, options) => {
    try {
      await update({ name, all: options.all });
    } catch (err) {
      console.error(chalk.red('Update failed:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

cli
  .command('info <name>', 'Show detailed information about an installed plugin')
  .option('--json', 'Output as JSON')
  .action(async (name: string, options) => {
    try {
      await info({ name, json: options.json });
    } catch (err) {
      console.error(chalk.red('Info failed:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

cli
  .command('doctor', 'Run diagnostics on store, agents, and symlinks')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await doctor({ json: options.json });
    } catch (err) {
      console.error(chalk.red('Doctor failed:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

cli
  .command('import <format> <source>', 'Translate a community plugin (Claude Code, Codex, Skills.sh) into an AgentPlugins manifest')
  .option('-o, --out <file>', 'Output manifest path (default: <source>/agentplugins.imported.json)')
  .option('--write', 'Install the generated manifest into the universal store', { default: false })
  .option('--no-vendor', 'Skip copying upstream files into .agentplugins-vendor/')
  .option('-q, --quiet', 'Suppress warning output', { default: false })
  .action(async (format: string, source: string, options) => {
    try {
      await importCommand({
        format,
        source,
        out: options.out,
        write: options.write,
        vendor: options.vendor,
        quiet: options.quiet,
      });
    } catch (err) {
      console.error(chalk.red('Import failed:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

cli
  .command('audit <source>', 'Audit a plugin source for installability and supply-chain risk without writing to the store')
  .option('--json', 'Output the report as JSON', { default: false })
  .option('--no-scripts', 'Skip lifecycle script policy evaluation')
  .action(async (source: string, options) => {
    try {
      const code = await audit({ source, json: options.json, scripts: options.scripts });
      process.exit(code);
    } catch (err) {
      console.error(chalk.red('Audit failed:'), err instanceof Error ? err.message : String(err));
      process.exit(2);
    }
  });

// ─── Codegen Commands ────────────────────────────────────────────────────────

cli
  .command('build', 'Build plugin for target platforms')
  .option('-t, --target <targets>', 'Comma-separated target platforms (claude,codex,copilot,gemini,kimi,opencode,pimono)')
  .option('-o, --out-dir <dir>', 'Output directory', { default: 'dist' })
  .option('--strict', 'Fail on warnings', { default: false })
  .option('--config <file>', 'Config file path', { default: 'agentplugins.config.ts' })
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      const targets = options.target
        ? options.target.split(',').map((t: string) => t.trim())
        : config.manifest.targets;

      await build({
        config,
        targets,
        outDir: options.outDir,
        strict: options.strict,
      });
    } catch (err) {
      console.error(chalk.red('Build failed:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

cli
  .command('validate', 'Validate plugin configuration')
  .option('--config <file>', 'Config file path', { default: 'agentplugins.config.ts' })
  .option('-t, --target <targets>', 'Validate for specific targets only')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      const targets = options.target
        ? options.target.split(',').map((t: string) => t.trim())
        : undefined;

      await validate({ config, targets });
    } catch (err) {
      console.error(chalk.red('Validation failed:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

cli
  .command('init [name]', 'Scaffold a new AgentPlugins plugin')
  .option('-y, --yes', 'Skip prompts and use defaults')
  .option('-t, --template <name>', 'Template: minimal | logger | security-guard | formatter')
  .option('--target <targets>', 'Target platforms (comma-separated)')
  .action(async (name: string | undefined, options) => {
    try {
      await init({
        name,
        yes: options.yes || false,
        template: options.template,
        target: options.target,
      });
    } catch (err) {
      console.error(chalk.red('Init failed:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

cli
  .command('lint', 'Static analysis of plugin manifest')
  .option('--config <file>', 'Config file path', { default: 'agentplugins.config.ts' })
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      await lint({ config, json: options.json || false });
    } catch (err) {
      console.error(chalk.red('Lint failed:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

cli
  .command('preview', 'Preview compile output without writing to disk')
  .option('--config <file>', 'Config file path', { default: 'agentplugins.config.ts' })
  .option('-t, --target <targets>', 'Comma-separated target platforms')
  .option('--diff', 'Show diff against existing dist/ output')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      const targets = options.target
        ? options.target.split(',').map((t: string) => t.trim())
        : undefined;

      await preview({ config, targets, diff: options.diff || false });
    } catch (err) {
      console.error(chalk.red('Preview failed:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

cli.help();
cli.version(pkg.version);

cli.parse();
