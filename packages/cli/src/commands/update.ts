/**
 * AgentPlugins Update Command
 *
 * Pulls latest changes for a plugin (or all plugins).
 */

import { updatePlugin, listPlugins, getPluginInfo } from '@agentplugins/core';
import { getCliLogger } from '../logger.js';

const logger = getCliLogger();

export interface UpdateOptions {
  name?: string;
  all?: boolean;
}

export async function update(options: UpdateOptions): Promise<void> {
  // Update all
  if (options.all || !options.name) {
    const plugins = listPlugins();
    if (plugins.length === 0) {
      logger.info('\nNo plugins installed.\n');
      return;
    }

    logger.info('\n🔄 Updating {count} plugin{plural}\n', {
      count: plugins.length,
      plural: plugins.length > 1 ? 's' : '',
    });

    let success = 0;
    let failed = 0;
    for (const plugin of plugins) {
      try {
        process.stdout.write(`  ${plugin.meta.name}... `);
        const meta = updatePlugin(plugin.meta.name);
        logger.info('✓ {version} ({commit})', { version: meta.version, commit: meta.commit.slice(0, 7) });
        success++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('✗ {msg}', { msg });
        failed++;
      }
    }
    logger.info('\n{success} updated, {failed} failed.\n', { success, failed });
    return;
  }

  // Update single
  const name = options.name;
  const info = getPluginInfo(name);
  if (!info) {
    logger.error('Plugin "{name}" is not installed.', { name });
    process.exit(1);
  }

  logger.info('\n🔄 AgentPlugins Update\n');
  logger.info('Plugin: {name}', { name });
  logger.info('Current: v{version} ({commit})\n', {
    version: info.meta.version,
    commit: info.meta.commit.slice(0, 7),
  });

  try {
    const meta = updatePlugin(name);
    logger.info('\n✅ Updated {name}', { name });
    logger.info('   Version: {version}', { version: meta.version });
    logger.info('   Commit:  {commit}', { commit: meta.commit.slice(0, 7) });
    logger.info('   Updated: {updated}\n', { updated: meta.updatedAt });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('\nFailed to update: {msg}\n', { msg });
    process.exit(1);
  }
}
