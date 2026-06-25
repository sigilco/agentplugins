/**
 * Claude Code format ingestor.
 *
 * Reads a Claude Code plugin directory and translates it into an AgentPlugins
 * v1 manifest. Recognized inputs:
 *
 *   .claude-plugin/plugin.json   (required)
 *   hooks/hooks.json             (legacy single-file hooks)
 *   hooks/<name>.json            (per-event hook file, Claude ≥ 1.0.30)
 *   .mcp.json                    (MCP server registry)
 *   commands/*.md                (slash command surfaces)
 *
 * All other Claude surfaces (subagents, settings.local.json) are surfaced as
 * `dropped-field` warnings and preserved under `metadata._dropped` so a future
 * migration can recover them.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import {
  droppedField,
  droppedDependency,
  unsupportedHookReturn,
} from './warnings.js';
import type { IngestResult, IngestWarning, VendorFile } from './types.js';

interface ClaudePluginManifest {
  name?: string;
  version?: string;
  description?: string;
  author?: { name?: string; email?: string } | string;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  // Claude-specific surfaces
  commands?: string | string[];
  hooks?: string | string[];
  mcpServers?: string;
  agents?: string | string[];
}

interface ClaudeHooksConfig {
  hooks?: Record<string, Array<{ matcher?: string; hooks?: Array<{ type: string; command?: string; prompt?: string }> }>>;
}

interface ClaudeMcpConfig {
  mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string>; transport?: string }>;
}

const UNIVERSAL_HOOK_MAP: Record<string, string> = {
  PreToolUse: 'preToolUse',
  PostToolUse: 'postToolUse',
  PostToolUseFailure: 'postToolUseFailure',
  UserPromptSubmit: 'userPromptSubmit',
  SessionStart: 'sessionStart',
  SessionEnd: 'sessionEnd',
  Stop: 'stop',
  SubagentStart: 'subagentStart',
  SubagentStop: 'subagentStop',
  PreCompact: 'preCompact',
  PostCompact: 'postCompact',
  Notification: 'notification',
  PermissionRequest: 'permissionRequest',
  PermissionDenied: 'permissionDenied',
};

export function ingestClaudeCode(sourceRoot: string): IngestResult {
  const warnings: IngestWarning[] = [];
  const vendorFiles: VendorFile[] = [];

  const manifestPath = join(sourceRoot, '.claude-plugin', 'plugin.json');
  if (!existsSync(manifestPath)) {
    return {
      manifest: {},
      warnings: [
        {
          code: 'no-claude-manifest',
          severity: 'error',
          message: `No Claude Code manifest at ${manifestPath}. Claude Code plugins must have a .claude-plugin/plugin.json file.`,
        },
      ],
      vendorFiles: [],
      format: 'claude-code',
      sourceRoot,
    };
  }

  const raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as ClaudePluginManifest;

  const manifest: Record<string, unknown> = {
    name: raw.name ?? basename(sourceRoot),
    version: raw.version ?? '0.0.0',
    description: raw.description ?? 'Imported from Claude Code plugin',
  };

  if (raw.author) manifest.author = raw.author;
  if (raw.homepage) manifest.homepage = raw.homepage;
  if (raw.repository) manifest.repository = raw.repository;
  if (raw.license) manifest.license = raw.license;
  if (raw.keywords) manifest.keywords = raw.keywords;

  // ─── commands ────────────────────────────────────────────────────────────
  if (raw.commands) {
    const commandPaths = Array.isArray(raw.commands) ? raw.commands : [raw.commands];
    const commands: Array<{ name: string; description?: string; prompt?: string }> = [];
    for (const p of commandPaths) {
      const abs = resolveSourcePath(sourceRoot, p);
      const files = walkMarkdownFiles(abs);
      for (const f of files) {
        const rel = relFromRoot(sourceRoot, f.absolute);
        vendorFiles.push({ absolutePath: f.absolute, relativePath: rel, reason: 'Claude Code command markdown' });
        const content = readFileSync(f.absolute, 'utf-8');
        commands.push({
          name: stripExtension(basename(rel)),
          description: firstHeading(content) ?? undefined,
          prompt: content,
        });
      }
    }
    if (commands.length > 0) manifest.commands = commands;
  }

  // ─── hooks ───────────────────────────────────────────────────────────────
  const hooks = translateHooks(sourceRoot, raw.hooks, warnings, vendorFiles);
  if (Object.keys(hooks).length > 0) manifest.hooks = hooks;

  // ─── mcpServers ──────────────────────────────────────────────────────────
  if (raw.mcpServers) {
    const mcpAbs = resolveSourcePath(sourceRoot, raw.mcpServers);
    if (existsSync(mcpAbs)) {
      vendorFiles.push({ absolutePath: mcpAbs, relativePath: relFromRoot(sourceRoot, mcpAbs), reason: 'Claude Code MCP server registry' });
      const mcp = JSON.parse(readFileSync(mcpAbs, 'utf-8')) as ClaudeMcpConfig;
      if (mcp.mcpServers) {
        const out: Record<string, unknown> = {};
        for (const [name, cfg] of Object.entries(mcp.mcpServers)) {
          out[name] = {
            command: cfg.command,
            args: cfg.args,
            env: cfg.env,
            transport: cfg.transport === 'sse' ? 'http' : cfg.transport,
          };
        }
        manifest.mcpServers = out;
      }
    } else {
      warnings.push(droppedField(manifestPath, 'mcpServers', raw.mcpServers));
    }
  }

  // ─── agents ──────────────────────────────────────────────────────────────
  if (raw.agents) {
    warnings.push({
      code: 'claude-agents-not-mapped',
      severity: 'warning',
      message: 'Claude Code subagents live inside .claude/agents/*.md and are not auto-imported. Drop them under metadata._dropped for now.',
      field: 'agents',
    });
    manifest.metadata = { ...(manifest.metadata as Record<string, unknown> ?? {}), _dropped: { ...(manifest.metadata as Record<string, unknown>)?._dropped as Record<string, unknown> ?? {}, agents: raw.agents } };
  }

  // ─── emit metadata ingestor marker ──────────────────────────────────────
  manifest.metadata = {
    ...(manifest.metadata as Record<string, unknown> ?? {}),
    _ingestedFrom: 'claude-code',
    _ingestedAt: new Date().toISOString(),
  };

  return {
    manifest,
    warnings,
    vendorFiles,
    format: 'claude-code',
    sourceRoot,
  };
}

function translateHooks(
  sourceRoot: string,
  hooksRef: string | string[] | undefined,
  warnings: IngestWarning[],
  vendorFiles: VendorFile[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!hooksRef) return out;

  const refs = Array.isArray(hooksRef) ? hooksRef : [hooksRef];
  for (const ref of refs) {
    const abs = resolveSourcePath(sourceRoot, ref);
    if (!existsSync(abs)) continue;

    if (abs.endsWith('hooks.json')) {
      vendorFiles.push({ absolutePath: abs, relativePath: relFromRoot(sourceRoot, abs), reason: 'Claude Code hooks config' });
      const config = JSON.parse(readFileSync(abs, 'utf-8')) as ClaudeHooksConfig;
      for (const [claudeName, entries] of Object.entries(config.hooks ?? {})) {
        const universal = UNIVERSAL_HOOK_MAP[claudeName];
        if (!universal) {
          warnings.push(droppedField(abs, `hooks.${claudeName}`, entries));
          continue;
        }
        const flat = entries.flatMap((e) => e.hooks ?? []);
        const handlers = flat
          .map((h) => {
            if (h.type === 'command' && h.command) {
              return { type: 'command', command: h.command };
            }
            return null;
          })
          .filter(Boolean);
        if (handlers.length > 0) {
          out[universal] = { handler: handlers[0] };
          if (UNIVERSAL_HOOKS_WITH_RETURN_VALUES.has(universal)) {
            warnings.push(unsupportedHookReturn(universal, abs));
          }
        }
      }
    } else if (abs.endsWith('.json') && abs.includes('/hooks/')) {
      // Per-event hook file
      vendorFiles.push({ absolutePath: abs, relativePath: relFromRoot(sourceRoot, abs), reason: 'Claude Code per-event hook' });
      const eventName = basename(abs, '.json');
      const universal = UNIVERSAL_HOOK_MAP[eventName];
      if (!universal) {
        warnings.push(droppedField(abs, `hooks.${eventName}`, readFileSync(abs, 'utf-8')));
        continue;
      }
      const config = JSON.parse(readFileSync(abs, 'utf-8')) as ClaudeHooksConfig;
      const entries = config.hooks?.[eventName] ?? [];
      const handlers = entries.flatMap((e) => e.hooks ?? []).filter((h) => h.type === 'command' && h.command);
      if (handlers.length > 0) {
        out[universal] = { handler: { type: 'command', command: (handlers[0] as { command: string }).command } };
        if (UNIVERSAL_HOOKS_WITH_RETURN_VALUES.has(universal)) {
          warnings.push(unsupportedHookReturn(universal, abs));
        }
      }
    }
  }

  // Drop a generic dependency reminder if the hooks/ directory references scripts
  if (vendorFiles.some((v) => v.reason.includes('hook'))) {
    warnings.push(droppedDependency('(any script dependencies in hooks/)', sourceRoot));
  }

  return out;
}

const UNIVERSAL_HOOKS_WITH_RETURN_VALUES = new Set(['preToolUse', 'userPromptSubmit', 'preCompact']);

function resolveSourcePath(sourceRoot: string, ref: string): string {
  if (ref.startsWith('/')) return ref;
  return join(sourceRoot, ref);
}

function relFromRoot(sourceRoot: string, abs: string): string {
  if (abs.startsWith(sourceRoot + '/')) return abs.slice(sourceRoot.length + 1);
  return abs;
}

interface WalkedFile {
  absolute: string;
  relative: string;
}

function walkMarkdownFiles(absPath: string): WalkedFile[] {
  if (!existsSync(absPath)) return [];
  const stat = statSync(absPath);
  if (stat.isFile()) {
    return [{ absolute: absPath, relative: basename(absPath) }];
  }
  const out: WalkedFile[] = [];
  for (const entry of readdirSync(absPath, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push({ absolute: join(absPath, entry.name), relative: entry.name });
    }
  }
  return out;
}

function firstHeading(markdown: string): string | null {
  const m = markdown.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

function stripExtension(name: string): string {
  return name.replace(/\.md$/i, '');
}
