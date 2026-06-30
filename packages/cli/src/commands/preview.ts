/**
 * AgentPlugins Preview Command
 *
 * Runs the compile pipeline without writing to dist/, printing a file tree.
 * Optionally shows a diff against the existing dist/ output.
 */

import { resolve, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import {
  ALL_TARGETS,
  type TargetPlatform,
} from '@agentplugins/core';
import { compile } from './build.js';
import { getCliLogger } from '../logger.js';
import type { LoadedConfig } from '../config.js';

const logger = getCliLogger();

export interface PreviewOptions {
  config: LoadedConfig;
  targets?: string[];
  diff: boolean;
}

export async function preview(options: PreviewOptions): Promise<void> {
  const { config, diff } = options;
  const manifest = config.manifest;
  const targetList = (options.targets || manifest.targets || ALL_TARGETS) as TargetPlatform[];

  logger.info('\n👁  AgentPlugins Preview\n');
  logger.info('Plugin: {name} v{version}', { name: manifest.name, version: manifest.version });
  logger.info('Targets: {targets}', { targets: targetList.join(', ') });
  logger.info('');

  const results = await compile({
    manifest,
    targets: targetList,
    write: false,
    silent: true,
  });

  let totalFiles = 0;
  let changedFiles = 0;
  let newFiles = 0;

  for (const result of results) {
    if (result.skipped) {
      logger.warn('  {target}: skipped{error}', {
        target: result.target,
        error: result.error ? ` — ${result.error}` : '',
      });
      continue;
    }

    logger.info('  📦 {target}/', { target: result.target });
    totalFiles += result.files.length;

    for (const file of result.files) {
      const display = printTree(file.path);
      let suffix = '';

      if (diff) {
        const distPath = join('dist', result.target, file.path);
        const absDist = resolve(distPath);
        if (!existsSync(absDist)) {
          suffix = ' (new)';
          newFiles++;
        } else {
          try {
            const existing = readFileSync(absDist, 'utf-8');
            if (existing !== file.content) {
              suffix = ' (changed)';
              changedFiles++;
            } else {
              suffix = ' (unchanged)';
            }
          } catch {
            suffix = ' (new)';
            newFiles++;
          }
        }
      }

      logger.info('    {display}{suffix}', { display, suffix });
    }
    logger.info('');
  }

  logger.info('Summary:');
  logger.info('  Files: {count}', { count: totalFiles });
  if (diff) {
    logger.info('  Changed: {count}', { count: changedFiles });
    logger.info('  New: {count}', { count: newFiles });
    logger.info('  Unchanged: {count}', { count: totalFiles - changedFiles - newFiles });
  }
  logger.info('');

  // Diff output
  if (diff) {
    let anyDiff = false;
    for (const r of results) {
      for (const f of r.files) {
        const absDist = resolve(join('dist', r.target, f.path));
        if (!existsSync(absDist)) { anyDiff = true; break; }
        try {
          if (readFileSync(absDist, 'utf-8') !== f.content) { anyDiff = true; break; }
        } catch { anyDiff = true; break; }
      }
      if (anyDiff) break;
    }

    if (anyDiff) {
      logger.info('Changes detected. Run `agentplugins build` to write output.\n');
    } else {
      logger.info('No changes — dist/ is up to date.\n');
    }
  }
}

function printTree(filePath: string): string {
  return filePath.split('/').join(' / ');
}
