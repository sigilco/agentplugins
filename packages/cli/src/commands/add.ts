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
  getSkillsCompatPath,
  getPluginStorePath,
} from '@agentplugins/core';
import { join } from 'node:path';
import { existsSync, rmSync, mkdirSync, symlinkSync, unlinkSync } from 'node:fs';

export interface AddOptions {
  source: string;
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

  const name = manifestResult.manifest['name'] as string;
  const version = (manifestResult.manifest['version'] as string) || '0.0.0';

  console.log(chalk.cyan(`\nPlugin: ${name} v${version}`));
  console.log(chalk.gray(`Manifest: ${manifestResult.path} (${manifestResult.type})`));

  // Detect agents
  const agents = getDetectedAgents();
  if (agents.length === 0) {
    console.log(chalk.yellow('\n⚠  No agent harnesses detected. Plugin will be stored but not symlinked.'));
    console.log(chalk.gray('Install Claude, Codex, or another supported agent to enable symlinking.'));
  } else {
    console.log(chalk.gray(`Detected ${agents.length} agent${agents.length > 1 ? 's' : ''}: ${agents.map((a) => a.displayName).join(', ')}`));
  }

  // Install
  const result = installPlugin(tempDir, {
    source,
    name,
    commit,
    manifestPath: manifestResult.path,
    version,
  });

  // Also symlink to skills-compat for Skills.sh
  symlinkToSkillsCompat(name);

  // Summary
  console.log(chalk.green(`\n✅ Installed ${name} v${version}`));
  console.log(chalk.gray(`   Store: ${getStorePath()}/${name}`));

  if (result.symlinks.length > 0) {
    console.log(chalk.gray('\nSymlinked to:'));
    for (const s of result.symlinks) {
      console.log(chalk.gray(`   ${s.agentDisplayName}: ${s.linkPath}`));
    }
  }
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

/** Symlink plugin to ~/.agents/skills/ for Skills.sh compatibility */
function symlinkToSkillsCompat(name: string): void {
  const skillsPath = join(getSkillsCompatPath(), name);
  const targetPath = getPluginStorePath(name);
  try {
    mkdirSync(getSkillsCompatPath(), { recursive: true });
    if (existsSync(skillsPath)) {
      try { unlinkSync(skillsPath); } catch { /* ignore */ }
    }
    symlinkSync(targetPath, skillsPath, 'dir');
  } catch {
    // Non-fatal — skills compat is best-effort
  }
}
