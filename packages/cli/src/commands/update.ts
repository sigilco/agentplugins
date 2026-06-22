/**
 * AgentPlugins Update Command
 *
 * Pulls latest changes for a plugin (or all plugins).
 */

import chalk from 'chalk';
import { updatePlugin, listPlugins, getPluginInfo } from '@agentplugins/core';

export interface UpdateOptions {
  name?: string;
  all?: boolean;
}

export async function update(options: UpdateOptions): Promise<void> {
  // Update all
  if (options.all || !options.name) {
    const plugins = listPlugins();
    if (plugins.length === 0) {
      console.log(chalk.gray('\nNo plugins installed.\n'));
      return;
    }

    console.log(chalk.bold(`\n🔄 Updating ${plugins.length} plugin${plugins.length > 1 ? 's' : ''}\n`));

    let success = 0;
    let failed = 0;
    for (const plugin of plugins) {
      try {
        process.stdout.write(chalk.gray(`  ${plugin.meta.name}... `));
        const meta = updatePlugin(plugin.meta.name);
        console.log(chalk.green(`✓ ${meta.version} (${meta.commit.slice(0, 7)})`));
        success++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(chalk.red(`✗ ${msg}`));
        failed++;
      }
    }
    console.log(chalk.gray(`\n${success} updated, ${failed} failed.\n`));
    return;
  }

  // Update single
  const name = options.name;
  const info = getPluginInfo(name);
  if (!info) {
    console.error(chalk.red(`Plugin "${name}" is not installed.`));
    process.exit(1);
  }

  console.log(chalk.bold('\n🔄 AgentPlugins Update\n'));
  console.log(chalk.gray(`Plugin: ${name}`));
  console.log(chalk.gray(`Current: v${info.meta.version} (${info.meta.commit.slice(0, 7)})\n`));

  try {
    const meta = updatePlugin(name);
    console.log(chalk.green(`\n✅ Updated ${name}`));
    console.log(chalk.gray(`   Version: ${meta.version}`));
    console.log(chalk.gray(`   Commit:  ${meta.commit.slice(0, 7)}`));
    console.log(chalk.gray(`   Updated: ${meta.updatedAt}\n`));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\nFailed to update: ${msg}\n`));
    process.exit(1);
  }
}
