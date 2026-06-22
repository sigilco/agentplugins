/**
 * AgentPlugins Info Command
 *
 * Shows detailed information about an installed plugin.
 */

import chalk from 'chalk';
import { getPluginInfo } from '@agentplugins/core';

export interface InfoOptions {
  name: string;
  json?: boolean;
}

export async function info(options: InfoOptions): Promise<void> {
  const plugin = getPluginInfo(options.name);

  if (!plugin) {
    console.error(chalk.red(`Plugin "${options.name}" is not installed.`));
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify({
      name: plugin.meta.name,
      version: plugin.meta.version,
      source: plugin.meta.source,
      commit: plugin.meta.commit,
      installedAt: plugin.meta.installedAt,
      updatedAt: plugin.meta.updatedAt,
      manifestPath: plugin.meta.manifestPath,
      storePath: plugin.path,
      manifest: plugin.manifest,
      symlinks: plugin.symlinks,
    }, null, 2));
    return;
  }

  const m = plugin.meta;

  console.log(chalk.bold(`\nℹ️  ${m.name}\n`));

  console.log(chalk.cyan('  Metadata'));
  console.log(chalk.gray(`    Name:        ${m.name}`));
  console.log(chalk.gray(`    Version:     ${m.version}`));
  console.log(chalk.gray(`    Source:      ${m.source}`));
  console.log(chalk.gray(`    Commit:      ${m.commit}`));
  console.log(chalk.gray(`    Installed:   ${m.installedAt}`));
  console.log(chalk.gray(`    Updated:     ${m.updatedAt}`));
  console.log(chalk.gray(`    Manifest:    ${m.manifestPath}`));
  console.log(chalk.gray(`    Store path:  ${plugin.path}`));

  // Manifest details
  if (plugin.manifest) {
    const manifest = plugin.manifest;
    const description = manifest['description'] as string | undefined;
    const author = manifest['author'];
    const license = manifest['license'] as string | undefined;
    const hooks = manifest['hooks'];
    const skills = manifest['skills'];
    const tools = manifest['tools'];

    console.log(chalk.cyan('\n  Manifest'));
    if (description) console.log(chalk.gray(`    Description: ${description}`));
    if (author) {
      const authorStr = typeof author === 'string' ? author : (author as Record<string, string>)?.name || '';
      if (authorStr) console.log(chalk.gray(`    Author:      ${authorStr}`));
    }
    if (license) console.log(chalk.gray(`    License:     ${license}`));

    if (hooks && typeof hooks === 'object') {
      const hookNames = Object.keys(hooks as Record<string, unknown>);
      console.log(chalk.gray(`    Hooks:       ${hookNames.join(', ')}`));
    }
    if (Array.isArray(skills)) {
      console.log(chalk.gray(`    Skills:      ${skills.length}`));
    }
    if (Array.isArray(tools)) {
      console.log(chalk.gray(`    Tools:       ${tools.length}`));
    }
  }

  // Symlinks
  if (plugin.symlinks.length > 0) {
    console.log(chalk.cyan('\n  Symlinks'));
    for (const s of plugin.symlinks) {
      const status = s.valid ? chalk.green('✓') : chalk.red('✗');
      console.log(chalk.gray(`    ${status} ${s.agentDisplayName.padEnd(20)} ${s.linkPath}`));
    }
  } else {
    console.log(chalk.cyan('\n  Symlinks'));
    console.log(chalk.gray('    (none — no agent harnesses detected)'));
  }

  console.log();
}
