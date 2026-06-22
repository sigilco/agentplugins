/**
 * AgentPlugins List Command
 *
 * Lists all installed plugins in the universal store.
 */

import chalk from 'chalk';
import { listPlugins } from '@agentplugins/core';

export interface ListOptions {
  json?: boolean;
}

export async function list(options: ListOptions): Promise<void> {
  const plugins = listPlugins();

  if (options.json) {
    console.log(JSON.stringify(plugins.map((p) => ({
      name: p.meta.name,
      version: p.meta.version,
      source: p.meta.source,
      updatedAt: p.meta.updatedAt,
      symlinks: p.symlinks.map((s) => s.agent),
    })), null, 2));
    return;
  }

  if (plugins.length === 0) {
    console.log(chalk.gray('\nNo plugins installed.'));
    console.log(chalk.gray('Run `agentplugins add <github-url>` to install a plugin.\n'));
    return;
  }

  console.log(chalk.bold(`\n📦 Installed Plugins (${plugins.length})\n`));

  for (const plugin of plugins) {
    const symlinkCount = plugin.symlinks.length;
    const brokenCount = plugin.symlinks.filter((s) => !s.valid).length;

    const description = (plugin.manifest?.['description'] as string) ?? plugin.meta.source;

    console.log(chalk.cyan(`  ${plugin.meta.name}`) + chalk.gray(` v${plugin.meta.version}`));
    console.log(chalk.gray(`    ${description}`));

    if (plugin.meta.source && plugin.meta.source !== 'unknown') {
      console.log(chalk.gray(`    source:  ${plugin.meta.source}`));
    }
    console.log(chalk.gray(`    updated: ${plugin.meta.updatedAt}`));

    if (symlinkCount > 0) {
      const agentNames = plugin.symlinks.map((s) => s.agent).join(', ');
      const status = brokenCount > 0 ? chalk.yellow(` (${brokenCount} broken)`) : '';
      console.log(chalk.gray(`    linked:  ${agentNames}`) + status);
    } else {
      console.log(chalk.gray('    linked:  (none)'));
    }
    console.log();
  }
}
