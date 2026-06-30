/**
 * AgentPlugins List Command
 *
 * Lists all installed plugins in the universal store.
 */

import { listPlugins } from '@agentplugins/core';
import { getCliLogger } from '../logger.js';

const logger = getCliLogger();

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
    logger.info('\nNo plugins installed.');
    logger.info('Run `agentplugins add <github-url>` to install a plugin.\n');
    return;
  }

  logger.info('\n📦 Installed Plugins ({count})\n', { count: plugins.length });

  for (const plugin of plugins) {
    const symlinkCount = plugin.symlinks.length;
    const brokenCount = plugin.symlinks.filter((s) => !s.valid).length;

    const description = (plugin.manifest?.['description'] as string) ?? plugin.meta.source;

    logger.info('  {name} v{version}', { name: plugin.meta.name, version: plugin.meta.version });
    logger.info('    {description}', { description });

    if (plugin.meta.source && plugin.meta.source !== 'unknown') {
      logger.info('    source:  {source}', { source: plugin.meta.source });
    }
    logger.info('    updated: {updated}', { updated: plugin.meta.updatedAt });

    if (symlinkCount > 0) {
      const agentNames = plugin.symlinks.map((s) => s.agent).join(', ');
      logger.info('    linked:  {agents}{broken}', {
        agents: agentNames,
        broken: brokenCount > 0 ? ` (${brokenCount} broken)` : '',
      });
    } else {
      logger.info('    linked:  (none)');
    }
    logger.info('');
  }
}
