/**
 * `~/.agents/mcp.json` merge discipline — store-layout.md §5.2.
 * The shared file is ours to merge, not own: we add/replace only the
 * `mcpServers` member names our extensions manage (recorded in
 * `extensions.lock` `components[]`), preserve every other member name and
 * every other top-level field, and never create a non-`mcpServers`
 * top-level shape.
 */

import { FsPort } from "./ports.js";
import { atomicWriteFile } from "./atomic.js";
import { join } from "./path.js";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export interface RootMcpRead {
  /** Full parsed document when present and an object; null when absent. */
  doc: Record<string, unknown> | null;
  /** Server map; null when the file is absent or a foreign dialect. */
  mcpServers: Record<string, unknown> | null;
  /** Present when the file exists but must not be modified (§5.2.4). */
  foreignDialect?: string;
}

export const readRootMcp = async (fs: FsPort, path: string): Promise<RootMcpRead> => {
  let text: string;
  try {
    text = decoder.decode(await fs.readFile(path));
  } catch {
    return { doc: null, mcpServers: {} };
  }
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { doc: null, mcpServers: null, foreignDialect: "mcp.json is not valid JSON" };
  }
  if (!isPlainObject(doc) || !isPlainObject(doc["mcpServers"]))
    return {
      doc: isPlainObject(doc) ? doc : null,
      mcpServers: null,
      foreignDialect: "mcp.json lacks an object-valued mcpServers member",
    };
  return { doc, mcpServers: doc["mcpServers"] };
};

/** Recursively expand ${PLUGIN_ROOT}/${PLUGIN_DATA} in config values (§9.2). */
const expandPlaceholders = (
  value: unknown,
  pluginRoot: string,
  pluginData: string,
): unknown => {
  if (typeof value === "string")
    return value.replaceAll("${PLUGIN_ROOT}", pluginRoot).replaceAll("${PLUGIN_DATA}", pluginData);
  if (Array.isArray(value))
    return value.map((v) => expandPlaceholders(v, pluginRoot, pluginData));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value))
      out[k] = expandPlaceholders(v, pluginRoot, pluginData);
    return out;
  }
  return value;
};

export interface McpMergeResult {
  merged: string[];
  skippedForeignDialect: boolean;
}

/**
 * Merge a package's declared MCP servers into the root `mcp.json`.
 * `servers` are the package-side declarations; placeholders expand to the
 * installed package/data dirs. Foreign member names and top-level fields
 * are preserved untouched.
 */
export const mergeMcpServers = async (
  fs: FsPort,
  mcpPath: string,
  servers: { name: string; config: Record<string, unknown> }[],
  pluginRoot: string,
  pluginData: string,
): Promise<McpMergeResult> => {
  if (servers.length === 0) return { merged: [], skippedForeignDialect: false };
  const read = await readRootMcp(fs, mcpPath);
  if (read.foreignDialect !== undefined)
    return { merged: [], skippedForeignDialect: true };
  const doc: Record<string, unknown> = { ...(read.doc ?? {}) };
  const mcpServers = { ...(read.mcpServers ?? {}) };
  const merged: string[] = [];
  for (const { name, config } of servers) {
    mcpServers[name] = expandPlaceholders(config, pluginRoot, pluginData);
    merged.push(name);
  }
  doc["mcpServers"] = mcpServers;
  await atomicWriteFile(fs, mcpPath, encoder.encode(`${JSON.stringify(doc, null, 2)}\n`));
  return { merged, skippedForeignDialect: false };
};

/** Remove our managed member names from root mcp.json; preserve the rest. */
export const removeMcpServers = async (
  fs: FsPort,
  mcpPath: string,
  names: string[],
): Promise<McpMergeResult> => {
  if (names.length === 0) return { merged: [], skippedForeignDialect: false };
  const read = await readRootMcp(fs, mcpPath);
  if (read.doc === null || read.mcpServers === null)
    return { merged: [], skippedForeignDialect: read.foreignDialect !== undefined };
  const mcpServers = { ...read.mcpServers };
  const removed: string[] = [];
  for (const name of names) {
    if (name in mcpServers) {
      delete mcpServers[name];
      removed.push(name);
    }
  }
  if (removed.length > 0) {
    const doc = { ...read.doc, mcpServers };
    await atomicWriteFile(fs, mcpPath, encoder.encode(`${JSON.stringify(doc, null, 2)}\n`));
  }
  return { merged: removed, skippedForeignDialect: false };
};

export const rootMcpPathFor = (agentsRoot: string): string =>
  join(agentsRoot, "mcp.json");
