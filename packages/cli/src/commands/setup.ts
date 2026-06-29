/**
 * AgentPlugins Setup Command
 *
 * Re-runs an installed plugin's setup script with trust-on-first-use gating.
 */

import chalk from 'chalk';
import * as p from '@clack/prompts';
import {
  getStorePath,
  readMeta,
  findManifestInDir,
  resolveSetupCommand,
  hashSetupCommand,
  gateSetupCommand,
  runSetupCommand,
  readSetupRecord,
  writeSetupRecord,
  type SetupSource,
} from '@agentplugins/core';
import { join } from 'node:path';

export interface SetupFlowOptions {
  name: string;
  pluginDir: string;
  manifest: Record<string, unknown>;
  yes?: boolean;
  noSetup?: boolean;
  force?: boolean;
}

export interface SetupFlowResult {
  ran: boolean;
  exitCode?: number;
  skipped?: 'kill-switch' | 'flag' | 'none' | 'deny' | 'declined';
}

export async function runSetupFlow(opts: SetupFlowOptions): Promise<SetupFlowResult> {
  if (process.env.AGENTPLUGINS_SETUP_SCRIPTS === '0') {
    console.log(chalk.gray('Setup scripts disabled (AGENTPLUGINS_SETUP_SCRIPTS=0).'));
    return { ran: false, skipped: 'kill-switch' };
  }

  if (opts.noSetup) {
    return { ran: false, skipped: 'flag' };
  }

  const resolved = resolveSetupCommand(opts.pluginDir, opts.manifest);
  if (!resolved) {
    return { ran: false, skipped: 'none' };
  }

  const gate = gateSetupCommand(resolved.command, opts.name);
  if (gate.decision === 'deny') {
    console.log(chalk.red('\n⚠  Setup command blocked by policy:'));
    console.log(chalk.gray('  ' + resolved.command));
    for (const r of gate.reasons) console.log(chalk.gray('  - ' + r));
    return { ran: false, skipped: 'deny' };
  }

  const hash = hashSetupCommand(resolved.command, opts.pluginDir);
  const existing = readSetupRecord(opts.name);
  const trusted = !!existing && existing.hash === hash && existing.command === resolved.command;

  if (trusted && !opts.force) {
    console.log(chalk.gray('\nRe-running trusted setup…'));
    const r = await runSetupCommand({ command: resolved.command, pluginDir: opts.pluginDir });
    const now = new Date().toISOString();
    writeSetupRecord(opts.name, { ...existing!, lastRunAt: now, lastExitCode: r.code });
    console.log(chalk.gray('Setup exited (code ' + r.code + ').'));
    return { ran: true, exitCode: r.code };
  }

  let approve = opts.yes;
  if (!approve) {
    console.log(chalk.cyan('\n🔧 Setup script detected') + chalk.gray('  (source: ' + resolved.source + ')'));
    console.log(chalk.bold('  ' + resolved.command));
    if (gate.decision !== 'allow') {
      for (const r of gate.reasons) console.log(chalk.gray('  - ' + r));
    }
    const answer = await p.confirm({ message: 'Run this setup script now?', initialValue: false });
    approve = p.isCancel(answer) ? false : answer;
  }

  if (!approve) {
    console.log(chalk.gray('Skipping setup.'));
    return { ran: false, skipped: 'declined' };
  }

  console.log(chalk.blue('\nRunning setup…'));
  const r = await runSetupCommand({ command: resolved.command, pluginDir: opts.pluginDir });
  const now = new Date().toISOString();
  writeSetupRecord(opts.name, {
    command: resolved.command,
    hash,
    source: resolved.source as SetupSource,
    approvedAt: now,
    lastRunAt: now,
    lastExitCode: r.code,
  });
  const tag = r.code === 0 ? chalk.green('✓') : chalk.yellow('⚠');
  console.log(tag + ' Setup exited (code ' + r.code + ').');
  console.log(chalk.gray('   Re-run later: agentplugins setup ' + opts.name));
  return { ran: true, exitCode: r.code };
}

export interface SetupOptions {
  name: string;
  force?: boolean;
  yes?: boolean;
}

export async function setup(options: SetupOptions): Promise<void> {
  const meta = readMeta(options.name);
  if (!meta) {
    console.error(chalk.red(`Plugin "${options.name}" is not installed.`));
    process.exit(1);
  }
  const pluginDir = join(getStorePath(), options.name);
  const manifestResult = findManifestInDir(pluginDir);
  if (!manifestResult) {
    console.error(chalk.red(`No manifest found for installed plugin "${options.name}".`));
    process.exit(1);
  }
  await runSetupFlow({
    name: options.name,
    pluginDir,
    manifest: manifestResult.manifest,
    yes: options.yes,
    force: options.force,
  });
}
