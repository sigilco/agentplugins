/**
 * AgentPlugins Info Command
 *
 * Shows detailed information about an installed plugin.
 */

import { getPluginInfo } from '@agentplugins/core';
import { getCliLogger } from '../logger.js';

const logger = getCliLogger();

export interface InfoOptions {
  name: string;
  json?: boolean;
}

export async function info(options: InfoOptions): Promise<void> {
  const plugin = getPluginInfo(options.name);

  if (!plugin) {
    logger.error('Plugin "{name}" is not installed.', { name: options.name });
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

  logger.info('\nℹ️  {name}\n', { name: m.name });

  logger.info('  Metadata');
  logger.info('    Name:        {name}', { name: m.name });
  logger.info('    Version:     {version}', { version: m.version });
  logger.info('    Source:      {source}', { source: m.source });
  logger.info('    Commit:      {commit}', { commit: m.commit });
  logger.info('    Installed:   {installed}', { installed: m.installedAt });
  logger.info('    Updated:     {updated}', { updated: m.updatedAt });
  logger.info('    Manifest:    {manifest}', { manifest: m.manifestPath });
  logger.info('    Store path:  {path}', { path: plugin.path });

  // Manifest details
  if (plugin.manifest) {
    const manifest = plugin.manifest;
    const description = manifest['description'] as string | undefined;
    const author = manifest['author'];
    const license = manifest['license'] as string | undefined;
    const hooks = manifest['hooks'];
    const skills = manifest['skills'];
    const tools = manifest['tools'];

    logger.info('\n  Manifest');
    if (description) logger.info('    Description: {description}', { description });
    if (author) {
      const authorStr = typeof author === 'string' ? author : (author as Record<string, string>)?.name || '';
      if (authorStr) logger.info('    Author:      {author}', { author: authorStr });
    }
    if (license) logger.info('    License:     {license}', { license });

    if (hooks && typeof hooks === 'object') {
      const hookNames = Object.keys(hooks as Record<string, unknown>);
      logger.info('    Hooks:       {hooks}', { hooks: hookNames.join(', ') });
    }
    if (Array.isArray(skills)) {
      logger.info('    Skills:      {count}', { count: skills.length });
    }
    if (Array.isArray(tools)) {
      logger.info('    Tools:       {count}', { count: tools.length });
    }
  }

  // Symlinks
  if (plugin.symlinks.length > 0) {
    logger.info('\n  Symlinks');
    for (const s of plugin.symlinks) {
      const status = s.valid ? '✓' : '✗';
      logger.info('    {status} {agent} {path}', {
        status,
        agent: s.agentDisplayName.padEnd(20),
        path: s.linkPath,
      });
    }
  } else {
    logger.info('\n  Symlinks');
    logger.info('    (none — no agent harnesses detected)');
  }

  logger.info('');
}
