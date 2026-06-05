/**
 * AgentBridge Validate Command
 *
 * Validates plugin configuration without building.
 */

import chalk from 'chalk';
import {
  validateUniversal,
  validateForPlatform,
  ALL_TARGETS,
} from '@agentbridge/core';
import type { LoadedConfig } from '../config.js';

export interface ValidateOptions {
  config: LoadedConfig;
  targets?: string[];
}

export async function validate(options: ValidateOptions): Promise<void> {
  const { config } = options;
  const manifest = config.manifest;
  const targets = options.targets || manifest.targets || ALL_TARGETS;

  console.log(chalk.bold('\n🔍 AgentBridge Validation\n'));
  console.log(chalk.gray(`Plugin: ${manifest.name} v${manifest.version}`));
  console.log(chalk.gray(`Targets: ${targets.join(', ')}\n`));

  // Universal validation
  console.log(chalk.blue('Universal Rules:'));
  const universalIssues = validateUniversal(manifest);
  if (universalIssues.length === 0) {
    console.log(chalk.green('  ✓ No issues found'));
  } else {
    for (const issue of universalIssues) {
      printIssue(issue);
    }
  }

  // Per-platform validation
  for (const target of targets) {
    console.log(chalk.blue(`\n${target}:`));
    const issues = validateForPlatform(manifest, target as any);
    if (issues.length === 0) {
      console.log(chalk.green('  ✓ No issues found'));
    } else {
      for (const issue of issues) {
        printIssue(issue);
      }
    }
  }

  const totalErrors = universalIssues.filter(i => i.severity === 'error').length +
    targets.reduce((sum, t) => sum + validateForPlatform(manifest, t as any).filter(i => i.severity === 'error').length, 0);

  if (totalErrors === 0) {
    console.log(chalk.bold('\n✅ All checks passed!\n'));
  } else {
    console.log(chalk.bold(`\n❌ Found ${totalErrors} error(s)\n`));
    process.exit(1);
  }
}

function printIssue(issue: { severity: string; field?: string; message: string; suggestion?: string }): void {
  const color = issue.severity === 'error' ? chalk.red : issue.severity === 'warning' ? chalk.yellow : chalk.gray;
  const icon = issue.severity === 'error' ? '✗' : issue.severity === 'warning' ? '⚠' : 'ℹ';
  const field = issue.field ? chalk.gray(`[${issue.field}] `) : '';
  console.log(color(`  ${icon} ${field}${issue.message}`));
  if (issue.suggestion) {
    console.log(chalk.cyan(`    → ${issue.suggestion}`));
  }
}
