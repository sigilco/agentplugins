/**
 * AgentPlugins Universal Store
 *
 * Manages the universal plugin store at ~/.agents/plugins/<name>/.
 * Clones plugins from GitHub, symlinks them into every detected agent harness.
 * Skills.sh compatible — reads SKILL.md and scans ~/.agents/skills/.
 */

import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { sanitizeName } from '@agentplugins/compile';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  lstatSync,
  readlinkSync,
  renameSync,
} from 'node:fs';
import { execSync } from 'node:child_process';

// ponytail: module-level buffer; reset at the start of each top-level store op (install/remove/update)
const __linkErrors: string[] = [];
export function recordLinkError(msg: string): void { __linkErrors.push(msg); }
export function flushLinkErrors(): string[] { const e = __linkErrors.splice(0); return e; }

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentPathEntry {
  name: string;
  displayName: string;
  skillPath: string;
  binary: string;
  manifestPath: string;
  /**
   * Where compiled plugin artifacts should be installed.
   * Present only for harnesses that load compiled code rather than raw source.
   */
  pluginPath?: string;
  /**
   * How the compiled artifact is linked into pluginPath:
   * - 'file': a single <name>.ts file (e.g. OpenCode)
   * - 'dir': a directory symlink to the whole dist/<target>/ dir (e.g. Pi Mono)
   */
  pluginPathMode?: 'file' | 'dir';
  /**
   * Multi-artifact mapping: each entry links files from dist/<target>/<from>/ into <to>/.
   * When present, overrides the single-file/dir behavior of pluginPath/pluginPathMode.
   */
  artifacts?: Array<{ from: string; to: string }>;
}

export interface PluginMeta {
  /** Canonical plugin name (from manifest) */
  name: string;
  /** Source URL (normalized GitHub URL) */
  source: string;
  /** Git commit hash at install time */
  commit: string;
  /** ISO timestamp of initial install */
  installedAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** Relative path to manifest within the store dir */
  manifestPath: string;
  /** Plugin version from manifest */
  version: string;
}

export interface DetectedAgent {
  name: string;
  displayName: string;
  /** Absolute path to the agent's skill/plugin directory */
  skillPath: string;
  /** Binary name to check */
  binary: string;
  /** Whether the binary was found on PATH */
  binaryFound: boolean;
  /** Whether the skillPath directory exists */
  skillPathExists: boolean;
  /** Path to the agent's config/manifest file */
  manifestPath: string;
  /** Absolute path where compiled plugin artifacts are installed (harnesses with pluginPath only) */
  pluginPath?: string;
  /** Whether the pluginPath directory exists */
  pluginPathExists?: boolean;
  /** How the compiled artifact is linked (mirrors AgentPathEntry.pluginPathMode) */
  pluginPathMode?: 'file' | 'dir';
  /** Multi-artifact mapping (mirrors AgentPathEntry.artifacts) */
  artifacts?: Array<{ from: string; to: string }>;
}

export interface SymlinkInfo {
  agent: string;
  agentDisplayName: string;
  /** Path of the symlink */
  linkPath: string;
  /** Resolved target of the symlink */
  targetPath: string;
  /** Whether the symlink is valid (points to existing target) */
  valid: boolean;
}

export interface InstalledPlugin {
  meta: PluginMeta;
  /** Absolute path in the store */
  path: string;
  /** Parsed manifest (best-effort) */
  manifest: Record<string, unknown> | null;
  /** Symlinks across detected agents */
  symlinks: SymlinkInfo[];
}

export interface ManifestFindResult {
  /** Relative path to the manifest file within the dir */
  path: string;
  /** Parsed manifest object */
  manifest: Record<string, unknown>;
  /** Type of manifest found */
  type: 'json' | 'skill-md';
}

// ─── Embedded Agent Registry (from spec/v1/agent-paths.json) ─────────────────

export const AGENT_PATHS: readonly AgentPathEntry[] = [
  {
    name: 'claude',
    displayName: 'Claude Code',
    skillPath: '~/.claude/skills',
    binary: 'claude',
    manifestPath: '~/.claude.json',
  },
  {
    name: 'codex',
    displayName: 'Codex CLI',
    skillPath: '~/.codex/skills',
    binary: 'codex',
    manifestPath: '~/.codex/config.json',
  },
  {
    name: 'opencode',
    displayName: 'OpenCode',
    skillPath: '~/.config/opencode/skills',
    binary: 'opencode',
    manifestPath: '~/.config/opencode/config.json',
    pluginPath: '~/.config/opencode/plugins',
    pluginPathMode: 'file',
    artifacts: [
      { from: 'plugins', to: '~/.config/opencode/plugins' },
      { from: 'command', to: '~/.config/opencode/command' },
      { from: 'agent',   to: '~/.config/opencode/agent' },
    ],
  },
  {
    name: 'kimi',
    displayName: 'Kimi',
    skillPath: '~/.kimi/skills',
    binary: 'kimi',
    manifestPath: '~/.kimi/config.json',
  },
  {
    name: 'gemini',
    displayName: 'Gemini CLI',
    skillPath: '~/.gemini/skills',
    binary: 'gemini',
    manifestPath: '~/.gemini/settings.json',
  },
  {
    name: 'copilot',
    displayName: 'GitHub Copilot CLI',
    skillPath: '~/.copilot/skills',
    binary: 'copilot',
    manifestPath: '~/.copilot/config.json',
  },
  {
    name: 'pimono',
    displayName: 'Pi Mono',
    skillPath: '~/.pi/extensions',
    binary: 'pi',
    manifestPath: '~/.pi/config.json',
    pluginPath: '~/.pi/agent/extensions',
    pluginPathMode: 'dir',
  },
] as const;

// ─── Path Helpers ────────────────────────────────────────────────────────────

/** Expand ~ to the home directory */
export function expandHome(p: string): string {
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  if (p === '~') return homedir();
  return p;
}

/** Universal plugin store path: ~/.agents/plugins */
export function getStorePath(): string {
  return join(homedir(), '.agents', 'plugins');
}

/** Skills.sh compatibility path: ~/.agents/skills */
export function getSkillsCompatPath(): string {
  return join(homedir(), '.agents', 'skills');
}

/** Path for a specific plugin in the store */
export function getPluginStorePath(name: string): string {
  return join(getStorePath(), name);
}

/** Path to the meta file for a plugin */
export function getMetaPath(name: string): string {
  return join(getPluginStorePath(name), '.agentplugins-meta.json');
}

/** Path to the compiled dist directory for a plugin inside the store */
export function getPluginDistPath(name: string): string {
  return join(getPluginStorePath(name), '.agentplugins-dist');
}

// ─── Agent Detection ─────────────────────────────────────────────────────────

export function getAgentPaths(): readonly AgentPathEntry[] {
  return AGENT_PATHS;
}

/** Check if a binary is available on PATH */
function isBinaryAvailable(binary: string): boolean {
  try {
    const cmd = process.platform === 'win32' ? `where ${binary}` : `which ${binary}`;
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect installed agent harnesses.
 * An agent is "detected" if its binary is on PATH or its skillPath exists.
 */
export function detectAgents(): DetectedAgent[] {
  return AGENT_PATHS.map((entry) => {
    const skillPath = expandHome(entry.skillPath);
    const binaryFound = isBinaryAvailable(entry.binary);
    const skillPathExists = existsSync(skillPath);
    const pluginPath = entry.pluginPath ? expandHome(entry.pluginPath) : undefined;
    return {
      name: entry.name,
      displayName: entry.displayName,
      skillPath,
      binary: entry.binary,
      binaryFound,
      skillPathExists,
      manifestPath: expandHome(entry.manifestPath),
      ...(pluginPath !== undefined && {
        pluginPath,
        pluginPathExists: existsSync(pluginPath),
        pluginPathMode: entry.pluginPathMode,
      }),
      ...(entry.artifacts !== undefined && { artifacts: entry.artifacts }),
    };
  });
}

/** Get only agents that are actually installed (binary or skill path) */
export function getDetectedAgents(): DetectedAgent[] {
  return detectAgents().filter((a) => a.binaryFound || a.skillPathExists);
}

// ─── URL Normalization ───────────────────────────────────────────────────────

/**
 * Normalize a plugin source URL.
 * Accepts: https://github.com/u/r, git@github.com:u/r.git, u/r
 */
export function normalizeSource(source: string): string {
  let url = source.trim();

  // Shorthand: user/repo → full GitHub URL
  if (!url.includes('://') && !url.startsWith('git@') && /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(url)) {
    url = `https://github.com/${url}`;
  }

  // SSH → HTTPS
  if (url.startsWith('git@github.com:')) {
    const path = url.slice('git@github.com:'.length);
    url = `https://github.com/${path}`;
  }

  // Strip trailing .git
  if (url.endsWith('.git')) {
    url = url.slice(0, -4);
  }

  // Strip trailing slash
  url = url.replace(/\/$/, '');

  return url;
}

/** Extract the repo name from a GitHub URL */
export function extractRepoName(source: string): string {
  const normalized = normalizeSource(source);
  const parts = normalized.split('/');
  return parts[parts.length - 1] || 'unknown-plugin';
}

// ─── Store Operations ────────────────────────────────────────────────────────

/** Ensure the store and skills-compat directories exist */
export function initStore(): void {
  mkdirSync(getStorePath(), { recursive: true });
  mkdirSync(getSkillsCompatPath(), { recursive: true });
}

/**
 * Validate that a normalized clone URL points to GitHub.
 * Prevents community install from arbitrary git hosts.
 */
export function validateCloneUrl(url: string): void {
  if (!/^https:\/\/github\.com\//i.test(url)) {
    throw new Error(`Refusing to clone from non-GitHub source: ${url}`);
  }
}

/**
 * Clone a git repository to a destination directory.
 * Returns the commit hash.
 * Throws on failure.
 */
export function cloneRepo(source: string, dest: string): string {
  const url = normalizeSource(source);
  validateCloneUrl(url);
  execSync(`git clone --depth 1 "${url}" "${dest}"`, { stdio: 'pipe' });
  return execSync('git rev-parse HEAD', { cwd: dest, encoding: 'utf-8' }).trim();
}

/** Pull latest changes in a repo directory. Returns new commit hash. */
export function pullRepo(dir: string): string {
  execSync('git pull --ff-only', { cwd: dir, stdio: 'pipe' });
  return execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf-8' }).trim();
}

// ─── Manifest Finding ────────────────────────────────────────────────────────

const MANIFEST_CANDIDATES = [
  'agentplugins.config.json',
  'manifest.json',
  'package.json',
] as const;

/**
 * Find and parse a JSON manifest in a directory.
 * Does NOT handle TypeScript configs (callers should use jiti for those).
 * Falls back to SKILL.md synthesis for Skills.sh compatibility.
 */
export function findManifestInDir(dir: string): ManifestFindResult | null {
  // Try JSON manifests
  for (const candidate of MANIFEST_CANDIDATES) {
    const fullPath = join(dir, candidate);
    if (existsSync(fullPath)) {
      try {
        const raw = readFileSync(fullPath, 'utf-8');
        const data = JSON.parse(raw) as Record<string, unknown>;

        // For package.json, extract the manifest-like fields
        if (candidate === 'package.json') {
          if (!data['name'] || typeof data['name'] !== 'string') continue;
          const manifest: Record<string, unknown> = {
            name: data['name'],
            version: data['version'] || '0.0.0',
            description: data['description'] || `Plugin ${data['name']}`,
          };
          // Check for agentplugins field in package.json
          if (data['agentplugins'] && typeof data['agentplugins'] === 'object') {
            Object.assign(manifest, data['agentplugins']);
          }
          return { path: candidate, manifest, type: 'json' };
        }

        // Validate it has a name field
        if (!data['name']) continue;
        return { path: candidate, manifest: data, type: 'json' };
      } catch {
        continue;
      }
    }
  }

  // Try SKILL.md (Skills.sh compatibility)
  const skillPath = join(dir, 'SKILL.md');
  if (existsSync(skillPath)) {
    const content = readFileSync(skillPath, 'utf-8');
    const manifest = synthesizeFromSkillMd(content, basename(dir));
    return { path: 'SKILL.md', manifest, type: 'skill-md' };
  }

  return null;
}

/** Synthesize a minimal manifest from a SKILL.md file (Skills.sh compat) */
function synthesizeFromSkillMd(content: string, fallbackName: string): Record<string, unknown> {
  // Parse YAML frontmatter if present
  let name = fallbackName;
  let description = `Skills.sh plugin: ${fallbackName}`;

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const frontmatter = fmMatch[1];
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    if (nameMatch) name = nameMatch[1].trim();
    if (descMatch) description = descMatch[1].trim();
  }

  return {
    name,
    version: '0.0.0',
    description,
    skills: [{ name, description, content }],
  };
}

// ─── Plugin Meta ─────────────────────────────────────────────────────────────

/** Read the meta file for a plugin */
export function readMeta(name: string): PluginMeta | null {
  const metaPath = getMetaPath(name);
  if (!existsSync(metaPath)) return null;
  try {
    return JSON.parse(readFileSync(metaPath, 'utf-8')) as PluginMeta;
  } catch {
    return null;
  }
}

/** Write the meta file for a plugin */
export function writeMeta(meta: PluginMeta): void {
  const metaPath = getMetaPath(meta.name);
  writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
}

// ─── Install / Remove / List / Update ────────────────────────────────────────

export interface InstallOptions {
  /** Source URL */
  source: string;
  /** Canonical plugin name (from manifest) */
  name: string;
  /** Commit hash */
  commit: string;
  /** Relative path to manifest within the plugin dir */
  manifestPath: string;
  /** Version from manifest */
  version: string;
  /** Whether to symlink into detected agents (default: true) */
  symlink?: boolean;
}

export interface InstallResult {
  meta: PluginMeta;
  symlinks: SymlinkInfo[];
}

/**
 * Install a plugin into the store from a cloned directory.
 * Moves the directory to the store, writes meta, creates symlinks.
 */
export function installPlugin(
  cloneDir: string,
  opts: InstallOptions,
): InstallResult {
  initStore();

  const storePath = getPluginStorePath(opts.name);

  // Remove existing if present
  if (existsSync(storePath)) {
    unlinkAll(opts.name, detectAgents());
    rmSync(storePath, { recursive: true, force: true });
  }

  // Move clone to store
  renameSync(cloneDir, storePath);

  // Write meta
  const now = new Date().toISOString();
  const meta: PluginMeta = {
    name: opts.name,
    source: normalizeSource(opts.source),
    commit: opts.commit,
    installedAt: now,
    updatedAt: now,
    manifestPath: opts.manifestPath,
    version: opts.version,
  };
  writeFileSync(getMetaPath(opts.name), JSON.stringify(meta, null, 2), 'utf-8');

  // Create symlinks / compiled links
  const symlinks: SymlinkInfo[] = [];
  if (opts.symlink !== false) {
    const agents = getDetectedAgents();
    for (const agent of agents) {
      if (agent.pluginPath) {
        const infos = linkCompiledPlugin(opts.name, agent);
        symlinks.push(...infos);
        if (infos.length > 0) continue;
      }
      // Fallback for non-compiled harnesses: whole-dir link into skillPath
      const info = symlinkPlugin(opts.name, agent);
      if (info) symlinks.push(info);
      const nativeLinks = linkNativeArtifacts(opts.name, agent);
      symlinks.push(...nativeLinks);
    }
    // Flat per-skill links into skills-compat and all agent skillPaths
    const skillLinks = linkPluginSkills(opts.name, agents);
    symlinks.push(...skillLinks);
  }

  const errs = flushLinkErrors();
  if (errs.length > 0) {
    console.warn(`[agentplugins] WARN: ${errs.length} link(s) failed during install of "${opts.name}":`);
    for (const e of errs) console.warn(`  - ${e}`);
    process.exitCode = 1;
  }

  return { meta, symlinks };
}

/**
 * Full add flow: clone from source, find manifest, install.
 * Returns null if no manifest is found (caller can try TS loading).
 */
export function addPluginFromSource(source: string): InstallResult | null {
  initStore();

  const repoName = extractRepoName(source);
  const tempDir = join(getStorePath(), `.tmp-${repoName}-${Date.now()}`);

  // Clean up temp dir if it exists
  if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });

  // Clone
  const commit = cloneRepo(source, tempDir);

  // Find manifest
  const manifestResult = findManifestInDir(tempDir);
  if (!manifestResult) {
    // Return null — caller may try TS config via jiti
    return null;
  }

  const rawName = manifestResult.manifest['name'];
  const name = sanitizeName(rawName);
  const version = (manifestResult.manifest['version'] as string) || '0.0.0';

  return installPlugin(tempDir, {
    source,
    name,
    commit,
    manifestPath: manifestResult.path,
    version,
  });
}

/** Fully unlink every link type for a plugin across all agents */
export function unlinkAll(name: string, agents: readonly DetectedAgent[]): void {
  for (const agent of agents) {
    unlinkCompiledPlugin(name, agent);
    unlinkPluginSymlink(name, agent);
    unlinkNativeArtifacts(name, agent);
  }
  unlinkPluginSkills(name, agents as DetectedAgent[]);
  // Also remove old-style whole-dir skills-compat link
  const skillsLink = join(getSkillsCompatPath(), name);
  if (isSymlink(skillsLink)) {
    try { unlinkSync(skillsLink); } catch { /* ignore */ }
  }
}

/** Remove a plugin: unlink all symlinks, delete from store */
export function removePlugin(name: string): void {
  const storePath = getPluginStorePath(name);
  if (!existsSync(storePath)) {
    throw new Error(`Plugin "${name}" is not installed`);
  }

  const allAgents = detectAgents();
  unlinkAll(name, allAgents);

  // Remove from store
  rmSync(storePath, { recursive: true, force: true });
}

/** List all installed plugins */
export function listPlugins(): InstalledPlugin[] {
  const storePath = getStorePath();
  if (!existsSync(storePath)) return [];

  const agents = detectAgents();
  const entries = readdirSync(storePath);

  return entries
    .filter((entry) => !entry.startsWith('.tmp-'))
    .map((name) => {
      const pluginPath = join(storePath, name);
      if (!lstatSync(pluginPath).isDirectory()) return null;

      const meta = readMeta(name);
      const symlinks = getSymlinks(name, agents);

      // Try to parse manifest
      let manifest: Record<string, unknown> | null = null;
      if (meta) {
        const manifestFullPath = join(pluginPath, meta.manifestPath);
        if (existsSync(manifestFullPath)) {
          try {
            if (meta.manifestPath.endsWith('.json') || meta.manifestPath === 'package.json') {
              manifest = JSON.parse(readFileSync(manifestFullPath, 'utf-8'));
            } else if (meta.manifestPath === 'SKILL.md') {
              const result = findManifestInDir(pluginPath);
              manifest = result?.manifest ?? null;
            }
          } catch {
            manifest = null;
          }
        }
      }

      return {
        meta: meta ?? {
          name,
          source: 'unknown',
          commit: 'unknown',
          installedAt: 'unknown',
          updatedAt: 'unknown',
          manifestPath: 'unknown',
          version: 'unknown',
        },
        path: pluginPath,
        manifest,
        symlinks,
      } as InstalledPlugin;
    })
    .filter((p): p is InstalledPlugin => p !== null);
}

/** Get detailed info about a single plugin */
export function getPluginInfo(name: string): InstalledPlugin | null {
  const storePath = getPluginStorePath(name);
  if (!existsSync(storePath)) return null;

  const meta = readMeta(name);
  const agents = detectAgents();
  const symlinks = getSymlinks(name, agents);

  let manifest: Record<string, unknown> | null = null;
  if (meta) {
    const manifestFullPath = join(storePath, meta.manifestPath);
    if (existsSync(manifestFullPath)) {
      try {
        if (meta.manifestPath.endsWith('.json') || meta.manifestPath === 'package.json') {
          manifest = JSON.parse(readFileSync(manifestFullPath, 'utf-8'));
        } else if (meta.manifestPath === 'SKILL.md') {
          const result = findManifestInDir(storePath);
          manifest = result?.manifest ?? null;
        }
      } catch {
        manifest = null;
      }
    }
  }

  return {
    meta: meta ?? {
      name,
      source: 'unknown',
      commit: 'unknown',
      installedAt: 'unknown',
      updatedAt: 'unknown',
      manifestPath: 'unknown',
      version: 'unknown',
    },
    path: storePath,
    manifest,
    symlinks,
  };
}

/** Update a plugin: git pull + update meta + refresh symlinks */
export function updatePlugin(name: string): PluginMeta {
  const storePath = getPluginStorePath(name);
  if (!existsSync(storePath)) {
    throw new Error(`Plugin "${name}" is not installed`);
  }

  const oldMeta = readMeta(name);
  if (!oldMeta) {
    throw new Error(`Plugin "${name}" has no meta file — corrupted install`);
  }

  // Pull latest
  const newCommit = pullRepo(storePath);

  // Re-find manifest (in case it changed)
  const manifestResult = findManifestInDir(storePath);
  const version = manifestResult?.manifest['version'] as string || oldMeta.version;
  const manifestPath = manifestResult?.path || oldMeta.manifestPath;

  const updatedMeta: PluginMeta = {
    ...oldMeta,
    commit: newCommit,
    updatedAt: new Date().toISOString(),
    version,
    manifestPath,
  };

  writeFileSync(getMetaPath(name), JSON.stringify(updatedMeta, null, 2), 'utf-8');

  // Refresh symlinks / compiled links
  const agents = getDetectedAgents();
  for (const agent of agents) {
    unlinkCompiledPlugin(name, agent);
    unlinkPluginSymlink(name, agent);
    unlinkNativeArtifacts(name, agent);
    if (agent.pluginPath) {
      const infos = linkCompiledPlugin(name, agent);
      if (infos.length > 0) continue;
    }
    symlinkPlugin(name, agent);
    linkNativeArtifacts(name, agent);
  }
  // Refresh flat per-skill links
  unlinkPluginSkills(name, agents);
  linkPluginSkills(name, agents);

  const errs = flushLinkErrors();
  if (errs.length > 0) {
    console.warn(`[agentplugins] WARN: ${errs.length} link(s) failed during update of "${name}":`);
    for (const e of errs) console.warn(`  - ${e}`);
    process.exitCode = 1;
  }

  return updatedMeta;
}

// ─── Symlink Operations ──────────────────────────────────────────────────────

/**
 * Find the first .ts file in a dist directory, preferring <pluginName>.ts.
 * Falls back to scanning for any .ts file (handles scoped adapter filenames like @scope/name.ts).
 */
function findTsFile(dir: string, pluginName: string): string | null {
  const preferred = `${pluginName}.ts`;
  if (existsSync(join(dir, preferred))) return preferred;
  // Recursively find any .ts file
  function scan(d: string, base: string): string | null {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      const rel = base ? `${base}/${entry}` : entry;
      if (lstatSync(full).isDirectory()) {
        const found = scan(full, rel);
        if (found) return found;
      } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
        return rel;
      }
    }
    return null;
  }
  return scan(dir, '');
}

/**
 * Link compiled plugin artifacts from the store's .agentplugins-dist/<target>/
 * into the harness's plugin directories. Returns [] if the dist dir doesn't exist
 * or the agent doesn't have a pluginPath.
 *
 * When agent.artifacts is set (e.g. OpenCode), links each subdir's files into the
 * corresponding harness dir. Otherwise falls back to single-file or dir mode.
 */
export function linkCompiledPlugin(pluginName: string, agent: DetectedAgent): SymlinkInfo[] {
  if (!agent.pluginPath || !agent.pluginPathMode) return [];

  const targetDir = join(getPluginDistPath(pluginName), agent.name);
  if (!existsSync(targetDir)) return [];

  const results: SymlinkInfo[] = [];

  if (agent.artifacts) {
    // Multi-artifact mode: link files from each from/ subdir into the corresponding to/ dir
    for (const artifact of agent.artifacts) {
      const fromDir = join(targetDir, artifact.from);
      if (!existsSync(fromDir)) continue;
      const toDir = expandHome(artifact.to);
      mkdirSync(toDir, { recursive: true });
      for (const file of readdirSync(fromDir)) {
        const srcPath = join(fromDir, file);
        const linkPath = join(toDir, file);
        if (isSymlink(linkPath)) {
          unlinkSync(linkPath);
        }
        try {
          symlinkSync(srcPath, linkPath, 'file');
          results.push({ agent: agent.name, agentDisplayName: agent.displayName, linkPath, targetPath: srcPath, valid: existsSync(srcPath) });
        } catch (err) { recordLinkError(`${linkPath} → ${srcPath} (${agent.name}, artifact)`); }
      }
    }
    return results;
  }

  // Legacy single-file or dir mode (e.g. Pi Mono)
  mkdirSync(agent.pluginPath, { recursive: true });

  let linkPath: string;
  let targetPath: string;

  if (agent.pluginPathMode === 'file') {
    // Find the .ts file in the dist dir — adapter may use a scoped name as the filename
    const tsFile = findTsFile(targetDir, pluginName);
    if (!tsFile) return [];
    targetPath = join(targetDir, tsFile);
    linkPath = join(agent.pluginPath, `${pluginName}.ts`);
  } else {
    targetPath = targetDir;
    linkPath = join(agent.pluginPath, pluginName);
  }

  if (isSymlink(linkPath)) {
    unlinkSync(linkPath);
  }

  try {
    symlinkSync(targetPath, linkPath, agent.pluginPathMode === 'dir' ? 'dir' : 'file');
    results.push({ agent: agent.name, agentDisplayName: agent.displayName, linkPath, targetPath, valid: existsSync(targetPath) });
  } catch (err) { recordLinkError(`${linkPath} → ${targetPath} (${agent.name})`); }

  return results;
}

/**
 * Link native artifacts from <store>/<pluginName>/.<agent.name>/<artifact.from>/ into
 * the harness dir. Used for plugins that ship hand-crafted native content (no compilation).
 *
 * .mjs sources are linked under a .ts name so OpenCode auto-discovers them via file-drop.
 * Emits a WARN suggesting the author rename the source to .ts instead.
 */
export function linkNativeArtifacts(pluginName: string, agent: DetectedAgent): SymlinkInfo[] {
  if (!agent.artifacts) return [];
  const nativeDir = join(getPluginStorePath(pluginName), `.${agent.name}`);
  const results: SymlinkInfo[] = [];
  for (const artifact of agent.artifacts) {
    const fromDir = join(nativeDir, artifact.from);
    if (!existsSync(fromDir)) continue;
    const toDir = expandHome(artifact.to);
    mkdirSync(toDir, { recursive: true });
    for (const file of readdirSync(fromDir)) {
      const src = join(fromDir, file);
      let linkName = file;
      if (file.endsWith('.mjs')) {
        linkName = file.replace(/\.mjs$/, '.ts');
        console.warn(`[agentplugins] WARN: ${pluginName}: ${file} is .mjs — rename to .ts for OpenCode auto-discovery`);
      } else if (file.endsWith('.js')) {
        console.warn(`[agentplugins] WARN: ${pluginName}: ${file} is .js (ambiguous CJS/ESM) — rename to .ts`);
      }
      const dst = join(toDir, linkName);
      if (existsSync(dst) || isSymlink(dst)) {
        try { unlinkSync(dst); } catch { /* ignore */ }
      }
      try {
        symlinkSync(src, dst, lstatSync(src).isDirectory() ? 'dir' : 'file');
        results.push({ agent: agent.name, agentDisplayName: agent.displayName, linkPath: dst, targetPath: src, valid: existsSync(src) });
      } catch (err) { recordLinkError(`${dst} → ${src} (${agent.name}, native artifact)`); }
    }
  }
  return results;
}

/** Remove native artifact links for a plugin from an agent's dirs */
export function unlinkNativeArtifacts(pluginName: string, agent: DetectedAgent): void {
  if (!agent.artifacts) return;
  const nativeDir = join(getPluginStorePath(pluginName), `.${agent.name}`);
  for (const artifact of agent.artifacts) {
    const fromDir = join(nativeDir, artifact.from);
    if (!existsSync(fromDir)) continue;
    const toDir = expandHome(artifact.to);
    for (const file of readdirSync(fromDir)) {
      const linkName = file.endsWith('.mjs') ? file.replace(/\.mjs$/, '.ts') : file;
      const linkPath = join(toDir, linkName);
      if (isSymlink(linkPath)) {
        try { unlinkSync(linkPath); } catch { /* ignore */ }
      }
    }
  }
}

/** Remove compiled plugin links from an agent's plugin directories */
export function unlinkCompiledPlugin(pluginName: string, agent: DetectedAgent): void {
  if (!agent.pluginPath || !agent.pluginPathMode) return;

  if (agent.artifacts) {
    // Remove legacy-named symlink (e.g. pluginName.ts) that may exist from before artifacts mode
    const legacyLink = join(expandHome(agent.pluginPath), `${pluginName}.ts`);
    if (isSymlink(legacyLink)) {
      try { unlinkSync(legacyLink); } catch { /* ignore */ }
    }
    const targetDir = join(getPluginDistPath(pluginName), agent.name);
    for (const artifact of agent.artifacts) {
      const fromDir = join(targetDir, artifact.from);
      if (!existsSync(fromDir)) continue;
      const toDir = expandHome(artifact.to);
      for (const file of readdirSync(fromDir)) {
        const linkPath = join(toDir, file);
        if (isSymlink(linkPath)) {
          try { unlinkSync(linkPath); } catch { /* ignore */ }
        }
      }
    }
    return;
  }

  // Legacy mode
  const linkPath = agent.pluginPathMode === 'file'
    ? join(agent.pluginPath, `${pluginName}.ts`)
    : join(agent.pluginPath, pluginName);
  if (isSymlink(linkPath)) {
    try { unlinkSync(linkPath); } catch { /* ignore */ }
  }
}

/**
 * Create a symlink from agent's skillPath to the plugin store dir.
 * Returns null if the agent's skillPath doesn't exist.
 */
export function symlinkPlugin(pluginName: string, agent: DetectedAgent): SymlinkInfo | null {
  if (!agent.skillPathExists && !agent.binaryFound) return null;

  // Ensure the agent's skillPath exists
  mkdirSync(agent.skillPath, { recursive: true });

  const linkPath = join(agent.skillPath, pluginName);
  const targetPath = getPluginStorePath(pluginName);

  // Only unlink if it's a symlink — never rmSync a real directory.
  if (isSymlink(linkPath)) {
    unlinkSync(linkPath);
  }

  // Create symlink (relative for portability)
  try {
    symlinkSync(targetPath, linkPath, 'dir');
  } catch (err) {
    recordLinkError(`${linkPath} → ${targetPath} (${agent.name})`);
    return null;
  }

  return {
    agent: agent.name,
    agentDisplayName: agent.displayName,
    linkPath,
    targetPath,
    valid: existsSync(targetPath),
  };
}

/** Remove a plugin's symlink from an agent's skillPath */
export function unlinkPluginSymlink(pluginName: string, agent: DetectedAgent): void {
  const linkPath = join(agent.skillPath, pluginName);
  if (isSymlink(linkPath)) {
    try {
      unlinkSync(linkPath);
    } catch {
      // ignore
    }
  } else if (existsSync(linkPath) && lstatSync(linkPath).isDirectory()) {
    // Not a symlink but a real dir — leave it alone
  }
}

/**
 * Create per-skill flat symlinks for a plugin into:
 * - ~/.agents/skills/<skill-name>  (Skills.sh compat)
 * - <agent.skillPath>/<skill-name>  (for each detected agent)
 *
 * Scans only top-level skills/ subdirs (one level deep) to avoid nested dupes from plugins like
 * caveman-installer that bundle sub-plugins under plugins/ — which would cause Pi skill collisions
 * if the whole plugin dir were symlinked.
 */
export function linkPluginSkills(pluginName: string, agents: DetectedAgent[]): SymlinkInfo[] {
  const pluginDir = getPluginStorePath(pluginName);
  const skillsDir = join(pluginDir, 'skills');
  if (!existsSync(skillsDir)) return [];

  const results: SymlinkInfo[] = [];
  const skillsCompatPath = getSkillsCompatPath();
  mkdirSync(skillsCompatPath, { recursive: true });

  for (const skillDir of readdirSync(skillsDir)) {
    const skillDirPath = join(skillsDir, skillDir);
    if (!lstatSync(skillDirPath).isDirectory()) continue;
    const skillMdPath = join(skillDirPath, 'SKILL.md');
    if (!existsSync(skillMdPath)) continue;

    // Read frontmatter name; sanitize before using as symlink target.
    let skillName = skillDir;
    try {
      const content = readFileSync(skillMdPath, 'utf-8');
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const nameMatch = fmMatch[1].match(/^name:\s*(.+)$/m);
        if (nameMatch) skillName = sanitizeName(nameMatch[1].trim());
      }
    } catch { /* use dir name (sanitizeName rejection falls here too) */ }

    // Skills-compat link — only unlink symlinks, never rmSync real dirs.
    const compatLink = join(skillsCompatPath, skillName);
    if (isSymlink(compatLink)) {
      try { unlinkSync(compatLink); } catch { /* ignore */ }
    }
    try {
      symlinkSync(skillDirPath, compatLink, 'dir');
      results.push({ agent: 'skills-compat', agentDisplayName: 'Skills.sh compat', linkPath: compatLink, targetPath: skillDirPath, valid: true });
    } catch (err) { recordLinkError(`${compatLink} → ${skillDirPath} (skills-compat)`); }

    // Per-agent skillPath links (skip compiled-artifact harnesses — they have their own skill discovery)
    for (const agent of agents) {
      if (!agent.skillPathExists && !agent.binaryFound) continue;
      mkdirSync(agent.skillPath, { recursive: true });
      const agentSkillLink = join(agent.skillPath, skillName);
      if (isSymlink(agentSkillLink)) {
        try { unlinkSync(agentSkillLink); } catch { /* ignore */ }
      }
      try {
        symlinkSync(skillDirPath, agentSkillLink, 'dir');
        results.push({ agent: agent.name, agentDisplayName: agent.displayName, linkPath: agentSkillLink, targetPath: skillDirPath, valid: true });
      } catch (err) { recordLinkError(`${agentSkillLink} → ${skillDirPath} (${agent.name}, skill)`); }
    }
  }

  return results;
}

/** Remove per-skill symlinks for a plugin from skills-compat and all agent skillPaths */
function unlinkPluginSkills(pluginName: string, agents: DetectedAgent[]): void {
  const skillsDir = join(getPluginStorePath(pluginName), 'skills');
  if (!existsSync(skillsDir)) return;

  const skillsCompatPath = getSkillsCompatPath();

  for (const skillDir of readdirSync(skillsDir)) {
    const skillDirPath = join(skillsDir, skillDir);
    if (!lstatSync(skillDirPath).isDirectory()) continue;
    const skillMdPath = join(skillDirPath, 'SKILL.md');
    if (!existsSync(skillMdPath)) continue;

    let skillName = skillDir;
    try {
      const content = readFileSync(skillMdPath, 'utf-8');
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const nameMatch = fmMatch[1].match(/^name:\s*(.+)$/m);
        if (nameMatch) skillName = sanitizeName(nameMatch[1].trim());
      }
    } catch { /* use dir name (sanitizeName rejection falls here too) */ }

    const compatLink = join(skillsCompatPath, skillName);
    if (isSymlink(compatLink)) {
      try { unlinkSync(compatLink); } catch { /* ignore */ }
    }

    for (const agent of agents) {
      const agentSkillLink = join(agent.skillPath, skillName);
      if (isSymlink(agentSkillLink)) {
        try { unlinkSync(agentSkillLink); } catch { /* ignore */ }
      }
    }
  }
}

/** Get all symlinks for a plugin across agents (compiled artifact links + skill-path links) */
export function getSymlinks(pluginName: string, agents?: DetectedAgent[]): SymlinkInfo[] {
  const detectedAgents = agents ?? detectAgents();
  const results: SymlinkInfo[] = [];

  for (const agent of detectedAgents) {
    if (agent.pluginPath && agent.pluginPathMode) {
      if (agent.artifacts) {
        // Multi-artifact mode: report each linked artifact file
        const targetDir = join(getPluginDistPath(pluginName), agent.name);
        let foundAny = false;
        for (const artifact of agent.artifacts) {
          const fromDir = join(targetDir, artifact.from);
          if (!existsSync(fromDir)) continue;
          const toDir = expandHome(artifact.to);
          for (const file of readdirSync(fromDir)) {
            const linkPath = join(toDir, file);
            if (isSymlink(linkPath)) {
              const targetPath = readlinkSync(linkPath);
              results.push({ agent: agent.name, agentDisplayName: agent.displayName, linkPath, targetPath, valid: existsSync(targetPath) });
              foundAny = true;
            }
          }
        }
        if (foundAny) continue;
      } else {
        // Legacy single-file or dir mode
        const compiledLinkPath = agent.pluginPathMode === 'file'
          ? join(agent.pluginPath, `${pluginName}.ts`)
          : join(agent.pluginPath, pluginName);
        if (isSymlink(compiledLinkPath)) {
          const targetPath = readlinkSync(compiledLinkPath);
          results.push({ agent: agent.name, agentDisplayName: agent.displayName, linkPath: compiledLinkPath, targetPath, valid: existsSync(targetPath) });
          continue;
        }
      }
    }

    // Skill-path symlink (whole-dir fallback for non-compiled harnesses)
    const linkPath = join(agent.skillPath, pluginName);
    if (isSymlink(linkPath)) {
      const targetPath = readlinkSync(linkPath);
      results.push({ agent: agent.name, agentDisplayName: agent.displayName, linkPath, targetPath, valid: existsSync(targetPath) });
    } else if (existsSync(linkPath) && lstatSync(linkPath).isDirectory()) {
      results.push({ agent: agent.name, agentDisplayName: agent.displayName, linkPath, targetPath: linkPath, valid: true });
    }
  }

  return results;
}

/** Check if a path is a symlink */
function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

// ─── Doctor ──────────────────────────────────────────────────────────────────

export interface DoctorResult {
  storePath: string;
  storeExists: boolean;
  skillsCompatPath: string;
  skillsCompatExists: boolean;
  agents: DetectedAgent[];
  plugins: InstalledPlugin[];
  issues: DoctorIssue[];
}

export interface DoctorIssue {
  level: 'error' | 'warning' | 'info';
  message: string;
}

/** Run diagnostics on the store, agents, and symlinks */
export function runDoctor(): DoctorResult {
  const storePath = getStorePath();
  const skillsCompatPath = getSkillsCompatPath();
  const storeExists = existsSync(storePath);
  const skillsCompatExists = existsSync(skillsCompatPath);
  const agents = detectAgents();
  const plugins = listPlugins();
  const issues: DoctorIssue[] = [];

  // Store checks
  if (!storeExists) {
    issues.push({ level: 'info', message: 'Plugin store does not exist yet — run `agentplugins add` to create it' });
  }

  // Skills compat
  if (!skillsCompatExists) {
    issues.push({ level: 'info', message: 'Skills.sh compat directory does not exist yet' });
  }

  // Agent checks
  const detectedCount = agents.filter((a) => a.binaryFound || a.skillPathExists).length;
  if (detectedCount === 0) {
    issues.push({ level: 'warning', message: 'No agent harnesses detected — install Claude, Codex, or another supported agent' });
  }
  for (const agent of agents) {
    if (agent.binaryFound && !agent.skillPathExists) {
      issues.push({ level: 'info', message: `${agent.displayName} binary found but skill path (${agent.skillPath}) does not exist — will be created on first add` });
    }
  }

  // Symlink + compiled-link checks
  for (const plugin of plugins) {
    const invalidSymlinks = plugin.symlinks.filter((s) => !s.valid);
    for (const s of invalidSymlinks) {
      issues.push({ level: 'error', message: `Plugin "${plugin.meta.name}" has a broken link for ${s.agentDisplayName}: ${s.linkPath}` });
    }
    if (plugin.symlinks.length === 0 && detectedCount > 0) {
      issues.push({ level: 'warning', message: `Plugin "${plugin.meta.name}" has no links — run \`agentplugins update ${plugin.meta.name}\` to fix` });
    }
    // Warn if a compiled harness is detected but no compiled dist exists
    for (const agent of agents.filter((a) => a.binaryFound || a.skillPathExists)) {
      if (!agent.pluginPath) continue;
      const distDir = join(getPluginDistPath(plugin.meta.name), agent.name);
      if (!existsSync(distDir)) {
        issues.push({
          level: 'warning',
          message: `Plugin "${plugin.meta.name}" has no compiled dist for ${agent.displayName} — re-run \`agentplugins add\` to compile`,
        });
      }
    }
  }

  return {
    storePath,
    storeExists,
    skillsCompatPath,
    skillsCompatExists,
    agents,
    plugins,
    issues,
  };
}
