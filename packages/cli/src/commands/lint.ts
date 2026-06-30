/**
 * AgentPlugins Lint Command
 *
 * Static analysis of plugin manifests. Separate from `validate` (schema checks).
 * Catches common pitfalls: naming, versioning, handler safety, secrets, etc.
 */

import { lintManifest } from '@agentplugins/core';
import { getCliLogger } from '../logger.js';
import type { LoadedConfig } from '../config.js';

const logger = getCliLogger();

export interface LintOptions {
  config: LoadedConfig;
  json: boolean;
}

export async function lint(options: LintOptions): Promise<void> {
  const { config, json } = options;
  const manifest = config.manifest;
  const issues = lintManifest(manifest);

  if (json) {
    console.log(JSON.stringify({
      plugin: manifest.name,
      issues,
      summary: {
        errors: issues.filter(i => i.severity === 'error').length,
        warnings: issues.filter(i => i.severity === 'warning').length,
      },
    }, null, 2));
    return;
  }

  logger.info('\n🔍 AgentPlugins Lint\n');
  logger.info('Plugin: {name} v{version}\n', { name: manifest.name, version: manifest.version });

  if (issues.length === 0) {
    logger.info('  ✅ No issues found.\n');
    return;
  }

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  for (const issue of issues) {
    const field = issue.field ? ` [${issue.field}]` : '';
    const rule = ` (${issue.rule})`;
    const message = `  ${issue.severity === 'error' ? '✗' : '⚠'} ${issue.message}${field}${rule}`;
    if (issue.severity === 'error') {
      logger.error(message);
    } else {
      logger.warn(message);
    }
    if (issue.suggestion) {
      logger.info('     → {suggestion}', { suggestion: issue.suggestion });
    }
  }

  logger.info('');
  logger.info('Summary:');
  if (errors.length > 0) logger.error('  Errors: {count}', { count: errors.length });
  if (warnings.length > 0) logger.warn('  Warnings: {count}', { count: warnings.length });
  if (errors.length === 0 && warnings.length > 0) {
    logger.info('  Run with --strict to fail on warnings.');
  }
  logger.info('');

  if (errors.length > 0) {
    process.exit(1);
  }
}
