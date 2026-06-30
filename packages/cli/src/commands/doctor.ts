/**
 * AgentPlugins Doctor Command
 *
 * Runs diagnostics on the store, detected agents, and symlinks.
 */

import { runDoctor } from '@agentplugins/core';
import { getCliLogger } from '../logger.js';

const logger = getCliLogger();

export interface DoctorOptions {
  json?: boolean;
}

export async function doctor(options: DoctorOptions): Promise<void> {
  const result = runDoctor();

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  logger.info('\n🩺 AgentPlugins Doctor\n');

  // Store
  logger.info('Store');
  logger.info('  Path:    {path}', { path: result.storePath });
  logger.info('  Exists:  {exists}', { exists: result.storeExists ? 'yes' : 'no' });
  logger.info('  Skills:  {path}', { path: result.skillsCompatPath });
  logger.info('  Skills exists: {exists}', { exists: result.skillsCompatExists ? 'yes' : 'no' });

  // Agents
  logger.info('\nAgents');
  const detected = result.agents.filter((a) => a.binaryFound || a.skillPathExists);
  if (detected.length === 0) {
    logger.warn('  No agents detected.');
  }
  for (const agent of result.agents) {
    const detectedHere = agent.binaryFound || agent.skillPathExists;
    const status = detectedHere ? '✓' : '○';
    const binStatus = agent.binaryFound ? 'found' : 'not found';
    const pathStatus = agent.skillPathExists ? 'exists' : 'missing';
    logger.info('  {status} {name} binary: {bin}  path: {path}', {
      status,
      name: agent.displayName.padEnd(22),
      bin: binStatus,
      path: pathStatus,
    });
  }

  // Plugins
  logger.info('\nPlugins ({count})', { count: result.plugins.length });
  if (result.plugins.length === 0) {
    logger.info('  No plugins installed.');
  }
  for (const plugin of result.plugins) {
    const linkCount = plugin.symlinks.length;
    const broken = plugin.symlinks.filter((s) => !s.valid).length;
    const status = broken > 0 ? '⚠' : '✓';
    logger.info('  {status} {name} v{version}  links: {links}{broken}', {
      status,
      name: plugin.meta.name.padEnd(24),
      version: plugin.meta.version,
      links: linkCount,
      broken: broken > 0 ? ` (${broken} broken)` : '',
    });
  }

  // Issues
  if (result.issues.length > 0) {
    const errors = result.issues.filter((i) => i.level === 'error');
    logger.info('\nIssues ({count})', { count: result.issues.length });
    for (const issue of result.issues) {
      const icon = issue.level === 'error' ? '✗' : issue.level === 'warning' ? '⚠' : 'ℹ';
      if (issue.level === 'error') {
        logger.error('  {icon} {message}', { icon, message: issue.message });
      } else if (issue.level === 'warning') {
        logger.warn('  {icon} {message}', { icon, message: issue.message });
      } else {
        logger.info('  {icon} {message}', { icon, message: issue.message });
      }
    }

    if (errors.length > 0) {
      logger.error('\n{count} error(s) found.', { count: errors.length });
    }
  } else {
    logger.info('\n✅ All checks passed.');
  }

  logger.info('');
}
