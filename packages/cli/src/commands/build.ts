/**
 * AgentPlugins Build Command
 *
 * Compiles a universal plugin into platform-specific packages.
 */

import { resolve, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import chalk from 'chalk';
import {
  validateUniversal,
  validateForPlatform,
  ALL_TARGETS,
  type TargetPlatform,
} from '@agentplugins/core';
import type { LoadedConfig } from '../config.js';



export interface BuildOptions {
  config: LoadedConfig;
  targets?: string[];
  outDir: string;
  strict: boolean;
}

/** Lazy-loaded adapter factories */
type AdapterFactory = () => { compile: (manifest: any) => any };

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

export async function build(options: BuildOptions): Promise<void> {
  const { config, outDir } = options;
  const manifest = config.manifest;

  // Determine targets
  const targetList = (options.targets || manifest.targets || ALL_TARGETS) as TargetPlatform[];

  console.log(chalk.bold('\n🌉 AgentPlugins Build\n'));
  console.log(chalk.gray(`Plugin: ${manifest.name} v${manifest.version}`));
  console.log(chalk.gray(`Targets: ${targetList.join(', ')}`));
  console.log(chalk.gray(`Output: ${resolve(outDir)}\n`));

  // ─── Universal Validation ─────────────────────────────────────────────────
  console.log(chalk.blue('🔍 Running universal validation...'));
  const universalIssues = validateUniversal(manifest);
  printIssues(universalIssues);

  const hasErrors = universalIssues.some(i => i.severity === 'error');
  if (hasErrors) {
    throw new Error('Universal validation failed. Fix errors before building.');
  }

  // ─── Platform-Specific Compilation ────────────────────────────────────────
  const outRoot = resolve(outDir);

  for (const target of targetList) {
    let factory: AdapterFactory;
    try {
      factory = await getAdapterFactory(target);
    } catch (err) {
      console.log(chalk.yellow(`⚠️  No adapter for "${target}" — skipping`));
      continue;
    }

    console.log(chalk.blue(`\n📦 Building for ${target}...`));

    // Platform-specific validation
    const platformIssues = validateForPlatform(manifest, target);
    printIssues(platformIssues);

    const platformErrors = platformIssues.filter(i => i.severity === 'error');
    if (platformErrors.length > 0) {
      console.log(chalk.red(`   ✗ Build failed for ${target} (${platformErrors.length} error${platformErrors.length > 1 ? 's' : ''})`));
      continue;
    }

    // Compile
    try {
      const adapter = factory();
      const output = adapter.compile(manifest);

      // Write files
      const targetDir = join(outRoot, target);
      await mkdir(targetDir, { recursive: true });

      for (const file of output.files) {
        const filePath = join(targetDir, file.path);
        await mkdir(resolve(filePath, '..'), { recursive: true });
        await writeFile(filePath, file.content, 'utf-8');
      }

      // Print results
      console.log(chalk.green(`   ✓ Built ${output.files.length} file${output.files.length > 1 ? 's' : ''}`));
      if (output.warnings.length > 0) {
        for (const w of output.warnings) {
          console.log(chalk.yellow(`   ⚠ ${w}`));
        }
      }
      if (output.postInstall) {
        console.log(chalk.cyan(`   ⓘ ${output.postInstall.join('\n   ⓘ ')}`));
      }
    } catch (err) {
      console.log(chalk.red(`   ✗ Build failed for ${target}: ${err instanceof Error ? err.message : String(err)}`));
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log(chalk.bold('\n✅ Build complete!\n'));
  console.log(chalk.gray('Install your plugins:'));
  for (const target of targetList) {
    const installCmd = getInstallCommand(target, manifest.name);
    console.log(chalk.gray(`  ${target}: ${installCmd}`));
  }
  console.log();
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
