/**
 * AgentPlugins Preview Command
 *
 * Runs the compile pipeline without writing to dist/, printing a file tree.
 * Optionally shows a diff against the existing dist/ output.
 */

import { resolve, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import chalk from 'chalk';
import {
  ALL_TARGETS,
  type TargetPlatform,
} from '@agentplugins/core';
import { compile } from './build.js';
import type { LoadedConfig } from '../config.js';

export interface PreviewOptions {
  config: LoadedConfig;
  targets?: string[];
  diff: boolean;
}

export async function preview(options: PreviewOptions): Promise<void> {
  const { config, diff } = options;
  const manifest = config.manifest;
  const targetList = (options.targets || manifest.targets || ALL_TARGETS) as TargetPlatform[];

  console.log(chalk.bold('\n👁  AgentPlugins Preview\n'));
  console.log(chalk.gray(`Plugin: ${manifest.name} v${manifest.version}`));
  console.log(chalk.gray(`Targets: ${targetList.join(', ')}`));
  console.log();

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
      console.log(chalk.yellow(`  ${result.target}: skipped${result.error ? ` — ${result.error}` : ''}`));
      continue;
    }

    console.log(chalk.bold(`  📦 ${result.target}/`));
    totalFiles += result.files.length;

    for (const file of result.files) {
      const display = printTree(file.path);
      let suffix = '';

      if (diff) {
        const distPath = join('dist', result.target, file.path);
        const absDist = resolve(distPath);
        if (!existsSync(absDist)) {
          suffix = chalk.green(' (new)');
          newFiles++;
        } else {
          try {
            const existing = readFileSync(absDist, 'utf-8');
            if (existing !== file.content) {
              suffix = chalk.yellow(' (changed)');
              changedFiles++;
            } else {
              suffix = chalk.gray(' (unchanged)');
            }
          } catch {
            suffix = chalk.green(' (new)');
            newFiles++;
          }
        }
      }

      console.log(chalk.gray(`    ${display}`) + suffix);
    }
    console.log();
  }

  console.log(chalk.bold('Summary:'));
  console.log(chalk.gray(`  Files: ${totalFiles}`));
  if (diff) {
    console.log(chalk.gray(`  Changed: ${changedFiles}`));
    console.log(chalk.gray(`  New: ${newFiles}`));
    console.log(chalk.gray(`  Unchanged: ${totalFiles - changedFiles - newFiles}`));
  }
  console.log();

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
      console.log(chalk.cyan('Changes detected. Run `agentplugins build` to write output.\n'));
    } else {
      console.log(chalk.gray('No changes — dist/ is up to date.\n'));
    }
  }
}

function printTree(filePath: string): string {
  return filePath.split('/').join(' / ');
}
