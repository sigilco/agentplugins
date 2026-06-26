/**
 * AgentPlugins Add Command
 *
 * Clones a plugin from GitHub, installs it to the universal store,
 * and symlinks it into every detected agent harness.
 */

import chalk from 'chalk';
import {
  initStore,
  normalizeSource,
  extractRepoName,
  cloneRepo,
  findManifestInDir,
  installPlugin,
  getDetectedAgents,
  getStorePath,
} from '@agentplugins/core';
import { join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import { compile } from './build.js';
import { runSetupFlow } from './setup.js';
import { verifyIntegrity, evaluateManifestScripts } from '@agentplugins/security';
import type { PluginManifest } from '@agentplugins/core';

export interface AddOptions {
  source: string;
  yes?: boolean;
  noSetup?: boolean;
}

export async function add(options: AddOptions): Promise<void> {
  const source = normalizeSource(options.source);
  const repoName = extractRepoName(source);

  console.log(chalk.bold('\n📥 AgentPlugins Add\n'));
  console.log(chalk.gray(`Source:  ${source}`));
  console.log(chalk.gray(`Store:   ${getStorePath()}\n`));

  initStore();

  // Clone to temp dir
  const tempDir = join(getStorePath(), `.tmp-${repoName}-${Date.now()}`);
  if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });

  console.log(chalk.blue('Cloning repository...'));
  let commit: string;
  try {
    commit = cloneRepo(source, tempDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\nFailed to clone: ${msg}`));
    rmSync(tempDir, { recursive: true, force: true });
    process.exit(1);
  }
  console.log(chalk.gray(`Commit: ${commit}`));

  // Find manifest — try JSON/SKILL.md first
  let manifestResult = findManifestInDir(tempDir);

  // Fallback: try TypeScript config via jiti
  if (!manifestResult) {
    manifestResult = await tryTsConfig(tempDir);
  }

  if (!manifestResult) {
    console.error(chalk.red('\nNo plugin manifest found in repository.'));
    console.error(chalk.gray('Expected one of: agentplugins.config.ts, agentplugins.config.json, manifest.json, package.json, SKILL.md'));
    rmSync(tempDir, { recursive: true, force: true });
    process.exit(1);
  }

  const rawName = manifestResult.manifest['name'] as string;
  // Strip npm scope prefix (@scope/name → name) for use as a filesystem-safe plugin identifier
  const name = rawName.replace(/^@[^/]+\//, '');
  const version = (manifestResult.manifest['version'] as string) || '0.0.0';

  console.log(chalk.cyan(`\nPlugin: ${name} v${version}`));
  console.log(chalk.gray(`Manifest: ${manifestResult.path} (${manifestResult.type})`));

  // B17: verify pinned integrity (opt-in — only if manifest has integrity field)
  const integrity = manifestResult.manifest['integrity'] as string | undefined;
  if (integrity && integrity.length > 0) {
    const { match, reason } = verifyIntegrity(tempDir, integrity);
    if (!match) {
      console.error(chalk.red(`\nIntegrity check failed: ${reason}`));
      rmSync(tempDir, { recursive: true, force: true });
      process.exit(1);
    }
  }

  // B18: evaluate lifecycle script policy
  const scriptCheck = evaluateManifestScripts(manifestResult.manifest, name);
  if (!scriptCheck.ok) {
    for (const issue of scriptCheck.issues) {
      const tag = issue.decision === 'deny' ? chalk.red('[error]') : chalk.yellow('[review]');
      console.error(`  ${tag} ${issue.dependency} (${issue.phase}): ${issue.command}`);
      for (const r of issue.reasons) console.error(chalk.gray(`         ${r}`));
    }
    console.error(chalk.red('\nRefusing to install: lifecycle script policy violation'));
    rmSync(tempDir, { recursive: true, force: true });
    process.exit(1);
  }

  // Detect agents
  const agents = getDetectedAgents();
  if (agents.length === 0) {
    console.log(chalk.yellow('\n⚠  No agent harnesses detected. Plugin will be stored but not symlinked.'));
    console.log(chalk.gray('Install Claude, Codex, or another supported agent to enable symlinking.'));
  } else {
    console.log(chalk.gray(`Detected ${agents.length} agent${agents.length > 1 ? 's' : ''}: ${agents.map((a) => a.displayName).join(', ')}`));
  }

  // Compile for harnesses that load compiled artifacts (opencode, pimono)
  const compilableAgents = agents.filter((a) => a.pluginPath);
  if (compilableAgents.length > 0) {
    const targets = compilableAgents.map((a) => a.name);
    console.log(chalk.blue(`\nCompiling for ${targets.join(', ')}...`));
    const distDir = join(tempDir, '.agentplugins-dist');
    try {
      await compile({
        manifest: manifestResult.manifest as unknown as PluginManifest,
        targets: targets as any,
        write: true,
        outDir: distDir,
        pluginRoot: tempDir,
        silent: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(chalk.yellow(`\n⚠  Compilation failed: ${msg}`));
      console.log(chalk.gray('Plugin will be installed without compiled artifacts.'));
    }
  }

  // Install (also creates per-skill flat links via installPlugin → linkPluginSkills)
  const result = installPlugin(tempDir, {
    source,
    name,
    commit,
    manifestPath: manifestResult.path,
    version,
  });

  // Summary
  console.log(chalk.green(`\n✅ Installed ${name} v${version}`));
  console.log(chalk.gray(`   Store: ${getStorePath()}/${name}`));

  if (result.symlinks.length > 0) {
    console.log(chalk.gray('\nInstalled to:'));
    for (const s of result.symlinks) {
      console.log(chalk.gray(`   ${s.agentDisplayName}: ${s.linkPath}`));
    }
  }

  await runSetupFlow({
    name,
    pluginDir: tempDir,
    manifest: manifestResult.manifest,
    yes: options.yes,
    noSetup: options.noSetup,
  });

  console.log();
}

/** Try loading a TypeScript config via jiti */
async function tryTsConfig(dir: string): Promise<{ path: string; manifest: Record<string, unknown>; type: 'json' | 'skill-md' } | null> {
  const candidates = ['agentplugins.config.ts', 'agentplugins.config.js', 'agentplugins.config.mjs'];
  for (const candidate of candidates) {
    const fullPath = join(dir, candidate);
    if (!existsSync(fullPath)) continue;
    try {
      const jiti = (await import('jiti')).default as unknown as (
        filename: string,
        opts?: Record<string, unknown>
      ) => { import: (id: string, opts?: Record<string, unknown>) => Promise<unknown> };
      const loader = jiti(fullPath, { interopDefault: true, esmResolve: true });
      const mod = await loader.import(fullPath, { default: true });
      const exported = (mod as Record<string, unknown>)?.['default' as keyof typeof mod] ?? mod;
      const manifest = typeof exported === 'function'
        ? await (exported as () => Promise<Record<string, unknown>>)()
        : exported as Record<string, unknown>;
      if (manifest && typeof manifest['name'] === 'string') {
        return { path: candidate, manifest, type: 'json' };
      }
    } catch {
      continue;
    }
  }
  return null;
}

