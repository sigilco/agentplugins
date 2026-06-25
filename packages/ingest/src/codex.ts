/**
 * Codex CLI format ingestor.
 *
 * Codex plugins are structurally similar to Claude Code's but use a different
 * directory and a simpler hooks config. Reads:
 *
 *   .codex-plugin/plugin.json    (required)
 *   hooks.json                   (single flat hooks file)
 *   .mcp.json                    (MCP server registry)
 *
 * Codex-specific surfaces (`agents.md`, `app.tsx`, etc.) are not modeled in
 * AgentPlugins v1 and surface as warnings.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { droppedField, unsupportedHookReturn } from './warnings.js';
import type { IngestResult, IngestWarning, VendorFile } from './types.js';

interface CodexPluginManifest {
  name?: string;
  version?: string;
  description?: string;
  author?: string | { name?: string };
  homepage?: string;
  license?: string;
  keywords?: string[];
  hooks?: string;
  mcpServers?: string;
  agents?: string;
}

interface CodexHooksFile {
  hooks?: Record<string, Array<{ command: string }>>;
}

const CODEX_TO_UNIVERSAL: Record<string, string> = {
  'session_start': 'sessionStart',
  'subagent_start': 'subagentStart',
  'pre_tool_use': 'preToolUse',
  'permission_request': 'permissionRequest',
  'post_tool_use': 'postToolUse',
  'pre_compact': 'preCompact',
  'post_compact': 'postCompact',
  'user_prompt_submit': 'userPromptSubmit',
  'subagent_stop': 'subagentStop',
  'stop': 'stop',
};

const RETURN_VALUE_HOOKS = new Set(['preToolUse', 'userPromptSubmit', 'preCompact']);

export function ingestCodex(sourceRoot: string): IngestResult {
  const warnings: IngestWarning[] = [];
  const vendorFiles: VendorFile[] = [];

  const manifestPath = join(sourceRoot, '.codex-plugin', 'plugin.json');
  if (!existsSync(manifestPath)) {
    return {
      manifest: {},
      warnings: [
        {
          code: 'no-codex-manifest',
          severity: 'error',
          message: `No Codex manifest at ${manifestPath}. Codex plugins must have a .codex-plugin/plugin.json file.`,
        },
      ],
      vendorFiles: [],
      format: 'codex',
      sourceRoot,
    };
  }

  const raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as CodexPluginManifest;

  const manifest: Record<string, unknown> = {
    name: raw.name ?? basename(sourceRoot),
    version: raw.version ?? '0.0.0',
    description: raw.description ?? 'Imported from Codex plugin',
  };

  if (raw.author) manifest.author = raw.author;
  if (raw.homepage) manifest.homepage = raw.homepage;
  if (raw.license) manifest.license = raw.license;
  if (raw.keywords) manifest.keywords = raw.keywords;

  // ─── hooks ───────────────────────────────────────────────────────────────
  if (raw.hooks) {
    const hooksAbs = join(sourceRoot, raw.hooks);
    if (existsSync(hooksAbs)) {
      vendorFiles.push({ absolutePath: hooksAbs, relativePath: raw.hooks, reason: 'Codex hooks config' });
      const config = JSON.parse(readFileSync(hooksAbs, 'utf-8')) as CodexHooksFile;
      const hooks: Record<string, unknown> = {};
      for (const [codexName, entries] of Object.entries(config.hooks ?? {})) {
        const universal = CODEX_TO_UNIVERSAL[codexName];
        if (!universal) {
          warnings.push(droppedField(hooksAbs, `hooks.${codexName}`, entries));
          continue;
        }
        const commands = entries.map((e) => e.command).filter(Boolean);
        if (commands.length > 0) {
          hooks[universal] = { handler: { type: 'command', command: commands[0] } };
          if (RETURN_VALUE_HOOKS.has(universal)) {
            warnings.push(unsupportedHookReturn(universal, hooksAbs));
          }
        }
      }
      if (Object.keys(hooks).length > 0) manifest.hooks = hooks;
    }
  }

  // ─── mcpServers ──────────────────────────────────────────────────────────
  if (raw.mcpServers) {
    const mcpAbs = join(sourceRoot, raw.mcpServers);
    if (existsSync(mcpAbs)) {
      vendorFiles.push({ absolutePath: mcpAbs, relativePath: raw.mcpServers, reason: 'Codex MCP server registry' });
      const mcp = JSON.parse(readFileSync(mcpAbs, 'utf-8')) as { mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }> };
      if (mcp.mcpServers) {
        const out: Record<string, unknown> = {};
        for (const [name, cfg] of Object.entries(mcp.mcpServers)) {
          out[name] = { command: cfg.command, args: cfg.args, env: cfg.env, transport: 'stdio' };
        }
        manifest.mcpServers = out;
      }
    }
  }

  // ─── agents ──────────────────────────────────────────────────────────────
  if (raw.agents) {
    warnings.push({
      code: 'codex-agents-not-mapped',
      severity: 'warning',
      message: 'Codex agents.md is not auto-imported. Use the @agentplugins/migrate MCP server to convert agents manually.',
      field: 'agents',
    });
    manifest.metadata = { ...(manifest.metadata as Record<string, unknown> ?? {}), _dropped: { ...((manifest.metadata as Record<string, unknown>)?._dropped as Record<string, unknown> ?? {}), codexAgents: raw.agents } };
  }

  manifest.metadata = {
    ...(manifest.metadata as Record<string, unknown> ?? {}),
    _ingestedFrom: 'codex',
    _ingestedAt: new Date().toISOString(),
  };

  return {
    manifest,
    warnings,
    vendorFiles,
    format: 'codex',
    sourceRoot,
  };
}
