/**
 * AgentPlugins Validate Command
 *
 * Validates plugin configuration without building.
 */

import {
  validateUniversal,
  validateForPlatform,
  ALL_TARGETS,
} from '@agentplugins/core';
import { getCliLogger } from '../logger.js';
import type { LoadedConfig } from '../config.js';

const logger = getCliLogger();

export interface ValidateOptions {
  config: LoadedConfig;
  targets?: string[];
}

export async function validate(options: ValidateOptions): Promise<void> {
  const { config } = options;
  const manifest = config.manifest;
  const targets = options.targets || manifest.targets || ALL_TARGETS;

  logger.info('\n🔍 AgentPlugins Validation\n');
  logger.info('Plugin: {name} v{version}', { name: manifest.name, version: manifest.version });
  logger.info('Targets: {targets}\n', { targets: targets.join(', ') });

  // Universal validation
  logger.info('Universal Rules:');
  const universalIssues = validateUniversal(manifest);
  if (universalIssues.length === 0) {
    logger.info('  ✓ No issues found');
  } else {
    for (const issue of universalIssues) {
      printIssue(issue);
    }
  }

  // Per-platform validation
  for (const target of targets) {
    logger.info('\n{target}:', { target });
    const issues = validateForPlatform(manifest, target as any);
    if (issues.length === 0) {
      logger.info('  ✓ No issues found');
    } else {
      for (const issue of issues) {
        printIssue(issue);
      }
    }
  }

  const totalErrors = universalIssues.filter(i => i.severity === 'error').length +
    targets.reduce((sum, t) => sum + validateForPlatform(manifest, t as any).filter(i => i.severity === 'error').length, 0);

  if (totalErrors === 0) {
    logger.info('\n✅ All checks passed!\n');
  } else {
    logger.error('\n❌ Found {count} error(s)\n', { count: totalErrors });
    process.exit(1);
  }
}

function printIssue(issue: { severity: string; field?: string; message: string; suggestion?: string }): void {
  const icon = issue.severity === 'error' ? '✗' : issue.severity === 'warning' ? '⚠' : 'ℹ';
  const field = issue.field ? `[${issue.field}] ` : '';
  const message = `  ${icon} ${field}${issue.message}`;
  if (issue.severity === 'error') {
    logger.error(message);
  } else if (issue.severity === 'warning') {
    logger.warn(message);
  } else {
    logger.info(message);
  }
  if (issue.suggestion) {
    logger.info('    → {suggestion}', { suggestion: issue.suggestion });
  }
}
