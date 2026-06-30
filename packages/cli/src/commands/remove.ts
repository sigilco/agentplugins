/**
 * AgentPlugins Remove Command
 *
 * Removes a plugin from the store and unlinks all symlinks.
 */

import { removePlugin, getPluginInfo } from '@agentplugins/core';
import { getCliLogger } from '../logger.js';

const logger = getCliLogger();

export interface RemoveOptions {
  name: string;
  force?: boolean;
}

export async function remove(options: RemoveOptions): Promise<void> {
  const { name } = options;

  const info = getPluginInfo(name);
  if (!info) {
    logger.error('Plugin "{name}" is not installed.', { name });
    process.exit(1);
  }

  logger.info('\n🗑  AgentPlugins Remove\n');
  logger.info('Plugin: {name} v{version}', { name, version: info.meta.version });
  logger.info('Source: {source}', { source: info.meta.source });

  if (info.symlinks.length > 0) {
    logger.info('Symlinks: {count}', { count: info.symlinks.length });
  }

  removePlugin(name);

  logger.info('\n✅ Removed {name}', { name });
  if (info.symlinks.length > 0) {
    logger.info('Unlinked from:');
    for (const s of info.symlinks) {
      logger.info('   {agent}: {path}', { agent: s.agentDisplayName, path: s.linkPath });
    }
  }
  logger.info('');
}
