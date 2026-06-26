/**
 * AgentPlugins Build Command
 *
 * Compiles a universal plugin into platform-specific packages.
 */

import { resolve, join } from 'node:path';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import chalk from 'chalk';
import {
  validateUniversal,
  validateForPlatform,
  ALL_TARGETS,
  type TargetPlatform,
  type PluginManifest,
  type CompileOptions as AdapterCompileOptions,
} from '@agentplugins/core';
import { sanitizeJoin, lint, type LintIssue } from '@agentplugins/compile';
import type { LoadedConfig } from '../config.js';

// ─── Compile (extracted for reuse by preview) ──────────────────────────────

export interface CompileFile {
  path: string;
  content: string;
}

export interface CompileResult {
  target: TargetPlatform;
  files: CompileFile[];
  warnings: string[];
  postInstall?: string[];
  skipped: boolean;
  error?: string;
}

export interface CompileOptions {
  manifest: PluginManifest;
  targets?: TargetPlatform[];
  write?: boolean;
  outDir?: string;
  silent?: boolean;
  /** Plugin root directory — required to resolve nativeEntry source paths. */
  pluginRoot?: string;
}

type AdapterFactory = () => { compile: (manifest: any, options?: AdapterCompileOptions) => any };

async function getAdapterFactory(target: TargetPlatform): Promise<AdapterFactory> {
  switch (target) {
    case 'claude':
      // @ts-ignore - adapter loaded dynamically at runtime
      return (await import('@agentplugins/adapter-claude')).createClaudeAdapter;
    case 'codex':
      // @ts-ignore - adapter loaded dynamically at runtime
      return (await import('@agentplugins/adapter-codex')).createCodexAdapter;
    case 'copilot':
      // @ts-ignore - adapter loaded dynamically at runtime
      return (await import('@agentplugins/adapter-copilot')).createCopilotAdapter;
    case 'gemini':
      // @ts-ignore - adapter loaded dynamically at runtime
      return (await import('@agentplugins/adapter-gemini')).createGeminiAdapter;
    case 'kimi':
      // @ts-ignore - adapter loaded dynamically at runtime
      return (await import('@agentplugins/adapter-kimi')).createKimiAdapter;
    case 'opencode':
      // @ts-ignore - adapter loaded dynamically at runtime
      return (await import('@agentplugins/adapter-opencode')).createOpenCodeAdapter;
    case 'pimono':
      // @ts-ignore - adapter loaded dynamically at runtime
      return (await import('@agentplugins/adapter-pimono')).createPiMonoAdapter;
    default:
      throw new Error(`Unknown target: ${target}`);
  }
}

/**
 * Run the compilation pipeline for one or more targets.
 * If `write` is true, files are written to `outDir/<target>/`.
 * Returns per-target results.
 */
export async function compile(options: CompileOptions): Promise<CompileResult[]> {
  const { manifest, write = false, outDir, silent = false, pluginRoot } = options;
  const targetList = (options.targets || manifest.targets || ALL_TARGETS) as TargetPlatform[];
  const results: CompileResult[] = [];

  for (const target of targetList) {
    let factory: AdapterFactory;
    try {
      factory = await getAdapterFactory(target);
    } catch {
      results.push({ target, files: [], warnings: [], skipped: true });
      continue;
    }

    if (!silent) console.log(chalk.blue(`\n📦 Building for ${target}...`));

    const platformIssues = validateForPlatform(manifest, target);
    const platformErrors = platformIssues.filter(i => i.severity === 'error');
    if (platformErrors.length > 0) {
      const msg = `${platformErrors.length} validation error${platformErrors.length > 1 ? 's' : ''}`;
      if (!silent) console.log(chalk.red(`   ✗ Build failed for ${target} (${msg})`));
      results.push({ target, files: [], warnings: [], skipped: true, error: msg });
      continue;
    }

    try {
      const adapter = factory();
      const output = adapter.compile(manifest, { pluginRoot });

      if (write && outDir) {
        const targetDir = join(resolve(outDir), target);
        await rm(targetDir, { recursive: true, force: true });
        await mkdir(targetDir, { recursive: true });
        for (const file of output.files) {
          const filePath = join(targetDir, file.path);
          await mkdir(resolve(filePath, '..'), { recursive: true });
          await writeFile(filePath, file.content, 'utf-8');
        }
        if (output.nativeCopies && pluginRoot) {
          const resolvedRoot = resolve(pluginRoot);
          for (const copy of output.nativeCopies) {
            const srcPath = sanitizeJoin(resolvedRoot, copy.from);
            const dstPath = sanitizeJoin(targetDir, copy.to);
            await mkdir(resolve(dstPath, '..'), { recursive: true });
            const content = await readFile(srcPath, 'utf-8');
            await writeFile(dstPath, content, 'utf-8');
          }
        }
      }

      if (!silent) {
        console.log(chalk.green(`   ✓ Built ${output.files.length} file${output.files.length > 1 ? 's' : ''}`));
        if (output.warnings.length > 0) {
          for (const w of output.warnings) console.log(chalk.yellow(`   ⚠ ${w}`));
        }
        if (output.postInstall) {
          console.log(chalk.cyan(`   ⓘ ${output.postInstall.join('\n   ⓘ ')}`));
        }
      }

      results.push({
        target,
        files: output.files,
        warnings: output.warnings || [],
        postInstall: output.postInstall,
        skipped: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!silent) console.log(chalk.red(`   ✗ Build failed for ${target}: ${msg}`));
      results.push({ target, files: [], warnings: [], skipped: true, error: msg });
    }
  }

  return results;
}

// ─── Build Command ──────────────────────────────────────────────────────────

export interface BuildOptions {
  config: LoadedConfig;
  targets?: string[];
  outDir: string;
  strict: boolean;
}

export async function build(options: BuildOptions): Promise<void> {
  const { config, outDir } = options;
  const manifest = config.manifest;
  const targetList = (options.targets || manifest.targets || ALL_TARGETS) as TargetPlatform[];

  console.log(chalk.bold('\n🌉 AgentPlugins Build\n'));
  console.log(chalk.gray(`Plugin: ${manifest.name} v${manifest.version}`));
  console.log(chalk.gray(`Targets: ${targetList.join(', ')}`));
  console.log(chalk.gray(`Output: ${resolve(outDir)}\n`));

  // Universal validation
  console.log(chalk.blue('🔍 Running universal validation...'));
  const universalIssues = validateUniversal(manifest);
  printIssues(universalIssues);
  const hasErrors = universalIssues.some(i => i.severity === 'error');
  if (hasErrors) {
    throw new Error('Universal validation failed. Fix errors before building.');
  }

  // Lint
  console.log(chalk.blue('🔍 Running lint...'));
  const inlineSources = await collectInlineSources(manifest, config.root);
  const lintIssues = lint({ manifest, inlineHandlerSource: inlineSources });
  printLintIssues(lintIssues);
  const lintErrors = lintIssues.filter(i => i.severity === 'error');
  if (options.strict && lintErrors.length > 0) {
    throw new Error(`Strict mode: ${lintErrors.length} lint error(s) found.`);
  }

  // Compile + write
  const results = await compile({
    manifest,
    targets: targetList,
    write: true,
    outDir,
    pluginRoot: config.root,
  });

  // Strict mode: fail on warnings
  if (options.strict) {
    const allWarnings = results.flatMap(r => r.warnings);
    if (allWarnings.length > 0) {
      throw new Error(`Strict mode: ${allWarnings.length} warning(s) found.`);
    }
  }

  // Summary
  console.log(chalk.bold('\n✅ Build complete!\n'));
  console.log(chalk.gray('Install your plugins:'));
  for (const r of results) {
    if (r.skipped) continue;
    const cmd = getInstallCommand(r.target, manifest.name);
    console.log(chalk.gray(`  ${r.target}: ${cmd}`));
  }
  console.log();
}

function printLintIssues(issues: LintIssue[]): void {
  for (const issue of issues) {
    const color = issue.severity === 'error' ? chalk.red : chalk.yellow;
    const icon = issue.severity === 'error' ? '✗' : '⚠';
    const field = issue.field ? chalk.gray(`[${issue.field}] `) : '';
    console.log(color(`   ${icon} ${field}${issue.message}`));
    if (issue.suggestion) {
      console.log(chalk.cyan(`     → ${issue.suggestion}`));
    }
  }
}

function printIssues(issues: Array<{ severity: string; field?: string; message: string; suggestion?: string }>): void {
  for (const issue of issues) {
    const color = issue.severity === 'error' ? chalk.red : issue.severity === 'warning' ? chalk.yellow : chalk.gray;
    const icon = issue.severity === 'error' ? '✗' : issue.severity === 'warning' ? '⚠' : 'ℹ';
    const field = issue.field ? chalk.gray(`[${issue.field}] `) : '';
    console.log(color(`   ${icon} ${field}${issue.message}`));
    if (issue.suggestion) {
      console.log(chalk.cyan(`     → ${issue.suggestion}`));
    }
  }
}

function getInstallCommand(target: string, pluginName: string): string {
  const commands: Record<string, string> = {
    claude: `cp -r dist/claude ~/.claude/skills/${pluginName}`,
    codex: `cp -r dist/codex ~/.codex/plugins/`,
    copilot: `copilot plugin install ./dist/copilot`,
    gemini: `gemini extensions install ./dist/gemini`,
    kimi: `cp -r dist/kimi ~/.kimi/plugins/`,
    opencode: `cp dist/opencode/*.ts .opencode/plugins/`,
    pimono: `cp -r dist/pimono ~/.pi/agent/extensions/`,
  };
  return commands[target] || `See ${target} documentation`;
}

async function collectInlineSources(manifest: PluginManifest, pluginRoot: string): Promise<string[]> {
  const sources: string[] = [];
  if (!manifest.hooks) return sources;
  for (const def of Object.values(manifest.hooks)) {
    if (!def) continue;
    const handler = def.handler as { type: string; code?: string; source?: string };
    if (handler.type === 'inline') {
      if (handler.code) {
        sources.push(handler.code);
      } else if (handler.source) {
        try {
          const content = await readFile(sanitizeJoin(resolve(pluginRoot), handler.source), 'utf-8');
          sources.push(content);
        } catch {
          // skip unreadable sources
        }
      }
    }
  }
  return sources;
}
