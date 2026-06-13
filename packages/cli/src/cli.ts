#!/usr/bin/env node
/**
 * AgentPlugins CLI
 *
 * Build AI agent plugins once, ship to any harness.
 *
 * Usage:
 *   npx agentplugins build              # Build plugin for all targets
 *   npx agentplugins build --target claude,codex  # Build for specific targets
 *   npx agentplugins validate           # Validate plugin without building
 *   npx agentplugins init               # Scaffold a new plugin
 */

import { cac } from 'cac';
import chalk from 'chalk';
import { build } from './commands/build.js';
import { validate } from './commands/validate.js';
import { init } from './commands/init.js';
import { loadConfig } from './config.js';

const cli = cac('agentplugins');

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
  .option('--target <targets>', 'Initial target platforms', { default: 'claude,codex' })
  .action(async (name: string | undefined, options) => {
    try {
      await init({
        name: name || 'my-agentplugins-plugin',
        targets: options.target.split(',').map((t: string) => t.trim()),
      });
    } catch (err) {
      console.error(chalk.red('Init failed:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

cli.help();
cli.version('0.1.0');

cli.parse();
