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

import { cli, command } from 'cleye';
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

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

cli({
  name: 'agentplugins',
  version: pkg.version,
  commands: [
    // ─── Distribution Commands ──────────────────────────────────────────────

    command({
      name: 'add',
      parameters: ['<source>'],
      flags: {
        yes: { type: Boolean, alias: 'y', description: 'Skip the setup trust prompt (still denylist-gated)' },
        noSetup: { type: Boolean, default: false, description: 'Do not run any setup script after install' },
      },
      help: { description: 'Install a plugin from GitHub to the store + all agents' },
    }, async ({ _, flags }) => {
      try {
        await add({ source: _.source, yes: flags.yes, noSetup: flags.noSetup });
      } catch (err) {
        console.error('Add failed:', formatError(err));
        process.exit(1);
      }
    }),

    command({
      name: 'setup',
      parameters: ['<name>'],
      flags: {
        force: { type: Boolean, alias: 'f', description: 'Re-prompt even if the setup command is unchanged/trusted' },
        yes: { type: Boolean, alias: 'y', description: 'Skip the trust prompt (still denylist-gated)' },
      },
      help: { description: "Run an installed plugin's setup script (re-runnable)" },
    }, async ({ _, flags }) => {
      try {
        await setup({ name: _.name, force: flags.force, yes: flags.yes });
      } catch (err) {
        console.error('Setup failed:', formatError(err));
        process.exit(1);
      }
    }),

    command({
      name: 'remove',
      parameters: ['<name>'],
      flags: {
        force: { type: Boolean, alias: 'f', default: false, description: 'Skip confirmation' },
      },
      help: { description: 'Remove a plugin from the store and unlink all symlinks' },
    }, async ({ _, flags }) => {
      try {
        await remove({ name: _.name, force: flags.force });
      } catch (err) {
        console.error('Remove failed:', formatError(err));
        process.exit(1);
      }
    }),

    command({
      name: 'list',
      flags: {
        json: { type: Boolean, description: 'Output as JSON' },
      },
      help: { description: 'List installed plugins' },
    }, async ({ flags }) => {
      try {
        await list({ json: flags.json });
      } catch (err) {
        console.error('List failed:', formatError(err));
        process.exit(1);
      }
    }),

    command({
      name: 'update',
      parameters: ['[name]'],
      flags: {
        all: { type: Boolean, alias: 'a', description: 'Update all installed plugins' },
      },
      help: { description: 'Update plugin(s) from source' },
    }, async ({ _, flags }) => {
      try {
        await update({ name: _.name, all: flags.all });
      } catch (err) {
        console.error('Update failed:', formatError(err));
        process.exit(1);
      }
    }),

    command({
      name: 'info',
      parameters: ['<name>'],
      flags: {
        json: { type: Boolean, description: 'Output as JSON' },
      },
      help: { description: 'Show detailed information about an installed plugin' },
    }, async ({ _, flags }) => {
      try {
        await info({ name: _.name, json: flags.json });
      } catch (err) {
        console.error('Info failed:', formatError(err));
        process.exit(1);
      }
    }),

    command({
      name: 'doctor',
      flags: {
        json: { type: Boolean, description: 'Output as JSON' },
      },
      help: { description: 'Run diagnostics on store, agents, and symlinks' },
    }, async ({ flags }) => {
      try {
        await doctor({ json: flags.json });
      } catch (err) {
        console.error('Doctor failed:', formatError(err));
        process.exit(1);
      }
    }),

    command({
      name: 'import',
      parameters: ['<format>', '<source>'],
      flags: {
        out: { type: String, alias: 'o', placeholder: '<file>', description: 'Output manifest path (default: <source>/agentplugins.imported.json)' },
        write: { type: Boolean, default: false, description: 'Install the generated manifest into the universal store' },
        noVendor: { type: Boolean, default: false, description: 'Skip copying upstream files into .agentplugins-vendor/' },
        quiet: { type: Boolean, alias: 'q', default: false, description: 'Suppress warning output' },
      },
      help: { description: 'Translate a community plugin (Claude Code, Codex, Skills.sh) into an AgentPlugins manifest' },
    }, async ({ _, flags }) => {
      try {
        await importCommand({
          format: _.format,
          source: _.source,
          out: flags.out,
          write: flags.write,
          vendor: !flags.noVendor,
          quiet: flags.quiet,
        });
      } catch (err) {
        console.error('Import failed:', formatError(err));
        process.exit(1);
      }
    }),

    command({
      name: 'audit',
      parameters: ['<source>'],
      flags: {
        json: { type: Boolean, default: false, description: 'Output the report as JSON' },
        noScripts: { type: Boolean, default: false, description: 'Skip lifecycle script policy evaluation' },
      },
      help: { description: 'Audit a plugin source for installability and supply-chain risk without writing to the store' },
    }, async ({ _, flags }) => {
      try {
        const code = await audit({ source: _.source, json: flags.json, scripts: !flags.noScripts });
        process.exit(code);
      } catch (err) {
        console.error('Audit failed:', formatError(err));
        process.exit(2);
      }
    }),

    // ─── Codegen Commands ───────────────────────────────────────────────────

    command({
      name: 'build',
      flags: {
        target: { type: String, alias: 't', placeholder: '<targets>', description: 'Comma-separated target platforms (claude,codex,copilot,gemini,kimi,opencode,pimono)' },
        outDir: { type: String, alias: 'o', placeholder: '<dir>', default: 'dist', description: 'Output directory' },
        strict: { type: Boolean, default: false, description: 'Fail on warnings' },
        config: { type: String, placeholder: '<file>', default: 'agentplugins.config.ts', description: 'Config file path' },
      },
      help: { description: 'Build plugin for target platforms' },
    }, async ({ flags }) => {
      try {
        const cfg = await loadConfig(flags.config);
        const targets = flags.target ? flags.target.split(',').map((t: string) => t.trim()) : undefined;
        await build({ config: cfg, targets, outDir: flags.outDir, strict: flags.strict });
      } catch (err) {
        console.error('Build failed:', formatError(err));
        process.exit(1);
      }
    }),

    command({
      name: 'validate',
      flags: {
        config: { type: String, placeholder: '<file>', default: 'agentplugins.config.ts', description: 'Config file path' },
        target: { type: String, alias: 't', placeholder: '<targets>', description: 'Validate for specific targets only' },
      },
      help: { description: 'Validate plugin configuration' },
    }, async ({ flags }) => {
      try {
        const cfg = await loadConfig(flags.config);
        const targets = flags.target ? flags.target.split(',').map((t: string) => t.trim()) : undefined;
        await validate({ config: cfg, targets });
      } catch (err) {
        console.error('Validation failed:', formatError(err));
        process.exit(1);
      }
    }),

    command({
      name: 'init',
      parameters: ['[name]'],
      flags: {
        yes: { type: Boolean, alias: 'y', description: 'Skip prompts and use defaults' },
        template: { type: String, alias: 't', placeholder: '<name>', description: 'Template: minimal | logger | security-guard | formatter' },
        target: { type: String, placeholder: '<targets>', description: 'Target platforms (comma-separated)' },
      },
      help: { description: 'Scaffold a new AgentPlugins plugin' },
    }, async ({ _, flags }) => {
      try {
        await init({ name: _.name, yes: flags.yes || false, template: flags.template, target: flags.target });
      } catch (err) {
        console.error('Init failed:', formatError(err));
        process.exit(1);
      }
    }),

    command({
      name: 'lint',
      flags: {
        config: { type: String, placeholder: '<file>', default: 'agentplugins.config.ts', description: 'Config file path' },
        json: { type: Boolean, description: 'Output as JSON' },
      },
      help: { description: 'Static analysis of plugin manifest' },
    }, async ({ flags }) => {
      try {
        const cfg = await loadConfig(flags.config);
        await lint({ config: cfg, json: flags.json || false });
      } catch (err) {
        console.error('Lint failed:', formatError(err));
        process.exit(1);
      }
    }),

    command({
      name: 'preview',
      flags: {
        config: { type: String, placeholder: '<file>', default: 'agentplugins.config.ts', description: 'Config file path' },
        target: { type: String, alias: 't', placeholder: '<targets>', description: 'Comma-separated target platforms' },
        diff: { type: Boolean, description: 'Show diff against existing dist/ output' },
      },
      help: { description: 'Preview compile output without writing to disk' },
    }, async ({ flags }) => {
      try {
        const cfg = await loadConfig(flags.config);
        const targets = flags.target ? flags.target.split(',').map((t: string) => t.trim()) : undefined;
        await preview({ config: cfg, targets, diff: flags.diff || false });
      } catch (err) {
        console.error('Preview failed:', formatError(err));
        process.exit(1);
      }
    }),
  ],
  help: {
    description: 'Build AI agent plugins once, ship to any harness.',
  },
});
