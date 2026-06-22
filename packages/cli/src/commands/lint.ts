/**
 * AgentPlugins Lint Command
 *
 * Static analysis of plugin manifests. Separate from `validate` (schema checks).
 * Catches common pitfalls: naming, versioning, handler safety, secrets, etc.
 */

import chalk from 'chalk';
import { lintManifest } from '@agentplugins/core';
import type { LoadedConfig } from '../config.js';

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

  console.log(chalk.bold('\n🔍 AgentPlugins Lint\n'));
  console.log(chalk.gray(`Plugin: ${manifest.name} v${manifest.version}\n`));

  if (issues.length === 0) {
    console.log(chalk.green('  ✅ No issues found.\n'));
    return;
  }

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  for (const issue of issues) {
    const color = issue.severity === 'error' ? chalk.red : chalk.yellow;
    const icon = issue.severity === 'error' ? '✗' : '⚠';
    const field = issue.field ? chalk.gray(` [${issue.field}]`) : '';
    const rule = chalk.gray(` (${issue.rule})`);
    console.log(color(`  ${icon} ${issue.message}${field}${rule}`));
    if (issue.suggestion) {
      console.log(chalk.cyan(`     → ${issue.suggestion}`));
    }
  }

  console.log();
  console.log(chalk.bold('Summary:'));
  if (errors.length > 0) console.log(chalk.red(`  Errors: ${errors.length}`));
  if (warnings.length > 0) console.log(chalk.yellow(`  Warnings: ${warnings.length}`));
  if (errors.length === 0 && warnings.length > 0) {
    console.log(chalk.gray('  Run with --strict to fail on warnings.'));
  }
  console.log();

  if (errors.length > 0) {
    process.exit(1);
  }
}
