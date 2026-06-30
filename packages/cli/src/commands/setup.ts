/**
 * AgentPlugins Setup Command
 *
 * Re-runs an installed plugin's setup script with trust-on-first-use gating.
 */

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
import { getCliLogger } from '../logger.js';

const logger = getCliLogger();

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
    logger.info('Setup scripts disabled (AGENTPLUGINS_SETUP_SCRIPTS=0).');
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
    logger.error('\n⚠  Setup command blocked by policy:');
    logger.info('  {command}', { command: resolved.command });
    for (const r of gate.reasons) logger.info('  - {reason}', { reason: r });
    return { ran: false, skipped: 'deny' };
  }

  const hash = hashSetupCommand(resolved.command, opts.pluginDir);
  const existing = readSetupRecord(opts.name);
  const trusted = !!existing && existing.hash === hash && existing.command === resolved.command;

  if (trusted && !opts.force) {
    logger.info('\nRe-running trusted setup…');
    const r = await runSetupCommand({ command: resolved.command, pluginDir: opts.pluginDir });
    const now = new Date().toISOString();
    writeSetupRecord(opts.name, { ...existing!, lastRunAt: now, lastExitCode: r.code });
    logger.info('Setup exited (code {code}).', { code: r.code });
    return { ran: true, exitCode: r.code };
  }

  let approve = opts.yes;
  if (!approve) {
    logger.info('\n🔧 Setup script detected  (source: {source})', { source: resolved.source });
    logger.info('  {command}', { command: resolved.command });
    if (gate.decision !== 'allow') {
      for (const r of gate.reasons) logger.info('  - {reason}', { reason: r });
    }
    const answer = await p.confirm({ message: 'Run this setup script now?', initialValue: false });
    approve = p.isCancel(answer) ? false : answer;
  }

  if (!approve) {
    logger.info('Skipping setup.');
    return { ran: false, skipped: 'declined' };
  }

  logger.info('\nRunning setup…');
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
  const tag = r.code === 0 ? '✓' : '⚠';
  if (r.code === 0) {
    logger.info('{tag} Setup exited (code {code}).', { tag, code: r.code });
  } else {
    logger.warn('{tag} Setup exited (code {code}).', { tag, code: r.code });
  }
  logger.info('   Re-run later: agentplugins setup {name}', { name: opts.name });
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
    logger.error('Plugin "{name}" is not installed.', { name: options.name });
    process.exit(1);
  }
  const pluginDir = join(getStorePath(), options.name);
  const manifestResult = findManifestInDir(pluginDir);
  if (!manifestResult) {
    logger.error('No manifest found for installed plugin "{name}".', { name: options.name });
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
