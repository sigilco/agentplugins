/**
 * AgentPlugins Doctor Command
 *
 * Runs diagnostics on the store, detected agents, and symlinks.
 */

import chalk from 'chalk';
import { runDoctor } from '@agentplugins/core';

export interface DoctorOptions {
  json?: boolean;
}

export async function doctor(options: DoctorOptions): Promise<void> {
  const result = runDoctor();

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(chalk.bold('\n🩺 AgentPlugins Doctor\n'));

  // Store
  console.log(chalk.cyan('Store'));
  console.log(chalk.gray(`  Path:    ${result.storePath}`));
  console.log(chalk.gray(`  Exists:  ${result.storeExists ? chalk.green('yes') : chalk.red('no')}`));
  console.log(chalk.gray(`  Skills:  ${result.skillsCompatPath}`));
  console.log(chalk.gray(`  Skills exists: ${result.skillsCompatExists ? chalk.green('yes') : chalk.red('no')}`));

  // Agents
  console.log(chalk.cyan('\nAgents'));
  const detected = result.agents.filter((a) => a.binaryFound || a.skillPathExists);
  if (detected.length === 0) {
    console.log(chalk.yellow('  No agents detected.'));
  }
  for (const agent of result.agents) {
    const detectedHere = agent.binaryFound || agent.skillPathExists;
    const status = detectedHere ? chalk.green('✓') : chalk.gray('○');
    const binStatus = agent.binaryFound ? chalk.green('found') : chalk.gray('not found');
    const pathStatus = agent.skillPathExists ? chalk.green('exists') : chalk.gray('missing');
    console.log(chalk.gray(`  ${status} ${agent.displayName.padEnd(22)} binary: ${binStatus}  path: ${pathStatus}`));
  }

  // Plugins
  console.log(chalk.cyan(`\nPlugins (${result.plugins.length})`));
  if (result.plugins.length === 0) {
    console.log(chalk.gray('  No plugins installed.'));
  }
  for (const plugin of result.plugins) {
    const linkCount = plugin.symlinks.length;
    const broken = plugin.symlinks.filter((s) => !s.valid).length;
    const status = broken > 0 ? chalk.yellow('⚠') : chalk.green('✓');
    console.log(chalk.gray(`  ${status} ${plugin.meta.name.padEnd(24)} v${plugin.meta.version}  links: ${linkCount}${broken > 0 ? ` (${broken} broken)` : ''}`));
  }

  // Issues
  if (result.issues.length > 0) {
    const errors = result.issues.filter((i) => i.level === 'error');
    console.log(chalk.cyan(`\nIssues (${result.issues.length})`));
    for (const issue of result.issues) {
      const icon = issue.level === 'error' ? chalk.red('✗') : issue.level === 'warning' ? chalk.yellow('⚠') : chalk.blue('ℹ');
      console.log(`  ${icon} ${issue.message}`);
    }

    if (errors.length > 0) {
      console.log(chalk.red(`\n${errors.length} error(s) found.`));
    }
  } else {
    console.log(chalk.green('\n✅ All checks passed.'));
  }

  console.log();
}
