#!/usr/bin/env node
/**
 * @agentplugins/migrate
 *
 * MCP server that exposes AgentPlugins migration tools to any MCP-compatible
 * agent (Claude Code, Codex, opencode, etc.). Five tools are exposed over the
 * stdio transport:
 *
 *   1. scan              — list which ingest formats apply to a source dir
 *   2. convert           — run a format ingestor and return the manifest + warnings
 *   3. write_manifest    — write the synthesized manifest to disk
 *   4. diff_manifest     — compare two manifests (original vs. generated)
 *   5. verify_integrity  — compute and verify SHA-256 over the source tarball
 *
 * Tools take structured JSON input validated with zod and return structured
 * JSON output. The server does NOT execute any code from the migrated source —
 * agents must review the returned manifest before writing or installing.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { scanTool } from './tools/scan.js';
import { convertTool } from './tools/convert.js';
import { writeManifestTool } from './tools/write-manifest.js';
import { diffManifestTool } from './tools/diff-manifest.js';
import { verifyIntegrityTool } from './tools/verify-integrity.js';

const server = new McpServer(
  {
    name: 'agentplugins-migrate',
    version: '0.3.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.tool('scan', 'List AgentPlugins ingest formats that recognize a source directory', scanTool.shape, scanTool.handler);
server.tool('convert', 'Run a format ingestor and return the synthesized manifest + warnings', convertTool.shape, convertTool.handler);
server.tool('write_manifest', 'Write a synthesized manifest to a destination path', writeManifestTool.shape, writeManifestTool.handler);
server.tool('diff_manifest', 'Diff a generated manifest against the original (or any other manifest)', diffManifestTool.shape, diffManifestTool.handler);
server.tool('verify_integrity', 'Compute SHA-256 over a source path and verify against a known integrity string', verifyIntegrityTool.shape, verifyIntegrityTool.handler);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[agentplugins-migrate] MCP server ready (stdio)');
}

main().catch((err) => {
  console.error('[agentplugins-migrate] Fatal:', err);
  process.exit(1);
});
