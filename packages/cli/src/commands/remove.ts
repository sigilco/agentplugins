/**
 * AgentPlugins Remove Command
 *
 * Removes a plugin from the store and unlinks all symlinks.
 */

import chalk from 'chalk';
import { removePlugin, getPluginInfo } from '@agentplugins/core';

export interface RemoveOptions {
  name: string;
  force?: boolean;
}

export async function remove(options: RemoveOptions): Promise<void> {
  const { name } = options;

  const info = getPluginInfo(name);
  if (!info) {
    console.error(chalk.red(`Plugin "${name}" is not installed.`));
    process.exit(1);
  }

  console.log(chalk.bold('\n🗑  AgentPlugins Remove\n'));
  console.log(chalk.gray(`Plugin: ${name} v${info.meta.version}`));
  console.log(chalk.gray(`Source: ${info.meta.source}`));

  if (info.symlinks.length > 0) {
    console.log(chalk.gray(`Symlinks: ${info.symlinks.length}`));
  }

  removePlugin(name);

  console.log(chalk.green(`\n✅ Removed ${name}`));
  if (info.symlinks.length > 0) {
    console.log(chalk.gray('Unlinked from:'));
    for (const s of info.symlinks) {
      console.log(chalk.gray(`   ${s.agentDisplayName}: ${s.linkPath}`));
    }
  }
  console.log();
}
