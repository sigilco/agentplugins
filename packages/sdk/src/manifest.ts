/**
 * Manifest handling — spec/manifest.md: Agent Plugins 1.0 `plugin.json`
 * base plus the `dev.anyharness` namespace, and the fixed-location
 * component inventory (§5) used for lockfile `components[]`.
 */

import { FsPort } from "./ports.js";
import { basename, join } from "./path.js";
import { parseFrontmatter } from "./frontmatter.js";
import { satisfiesRange } from "./semver.js";
import type { ComponentRef, ExtensionKind } from "./types.js";

const decoder = new TextDecoder();

/** Agent Plugins §5.5 name constraints (1–64, a-z0-9.-, alnum ends, no `--`/`..`). */
const NAME_RE = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

export const isValidExtensionName = (name: string): boolean =>
  name.length >= 1 && name.length <= 64 && NAME_RE.test(name);

export interface ManifestIssue {
  level: "error" | "warning";
  message: string;
}

export interface AnyharnessNamespace {
  namespaceVersion: number;
  capabilities: string[];
  engines?: { harness?: string };
  hooksFormat: number;
  componentsFormat: number;
}

export interface ParsedManifest {
  raw: Record<string, unknown>;
  name: string;
  version: string;
  schemaId: string;
  namespace?: AnyharnessNamespace;
}

const KNOWN_TOP_LEVEL = new Set([
  "$schema",
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "extensions",
]);

/** AnyHarness implementation version ranges are checked against. */
export const SDK_VERSION = "0.1.0";
/** dev.anyharness namespace format this build understands. */
export const NAMESPACE_VERSION = 1;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Validate a parsed `plugin.json` document. Returns the manifest on
 * success; `issues` carries both fatal errors and report-and-ignore
 * warnings (unknown top-level fields per Agent Plugins §5.2).
 */
export const validateManifest = (
  doc: unknown,
): { manifest?: ParsedManifest; issues: ManifestIssue[] } => {
  const issues: ManifestIssue[] = [];
  if (!isPlainObject(doc)) {
    issues.push({ level: "error", message: "plugin.json is not a JSON object" });
    return { issues };
  }
  for (const key of Object.keys(doc)) {
    if (!KNOWN_TOP_LEVEL.has(key))
      issues.push({ level: "warning", message: `unknown top-level field ignored: ${key}` });
  }
  const schemaId = doc["$schema"];
  if (typeof schemaId !== "string" || schemaId === "")
    issues.push({ level: "error", message: "missing required $schema id" });
  const name = doc["name"];
  if (typeof name !== "string" || !isValidExtensionName(name))
    issues.push({
      level: "error",
      message: `invalid or missing name (Agent Plugins §5.5): ${JSON.stringify(name)}`,
    });
  const version = doc["version"];
  // manifest.md §7: installers SHOULD require version — ManifestRef and
  // update checks are meaningless without it, so this build does.
  if (typeof version !== "string" || version === "")
    issues.push({ level: "error", message: "missing required version" });

  let namespace: AnyharnessNamespace | undefined;
  const extensions = doc["extensions"];
  if (extensions !== undefined) {
    if (!isPlainObject(extensions)) {
      issues.push({ level: "error", message: "extensions is not an object" });
    } else {
      const ns = extensions["dev.anyharness"];
      if (ns !== undefined) {
        if (!isPlainObject(ns)) {
          issues.push({ level: "error", message: "dev.anyharness is not an object" });
        } else {
          const nv = ns["namespaceVersion"];
          if (typeof nv !== "number" || !Number.isInteger(nv)) {
            issues.push({
              level: "warning",
              message:
                "dev.anyharness.namespaceVersion missing/non-integer — namespace skipped per manifest.md §4",
            });
          } else if (nv > NAMESPACE_VERSION) {
            issues.push({
              level: "warning",
              message: `dev.anyharness.namespaceVersion ${nv} > supported ${NAMESPACE_VERSION} — namespace skipped`,
            });
          } else {
            const caps = ns["capabilities"];
            const engines = ns["engines"];
            namespace = {
              namespaceVersion: nv,
              capabilities: Array.isArray(caps)
                ? caps.filter((c): c is string => typeof c === "string")
                : [],
              engines: isPlainObject(engines)
                ? { harness: typeof engines["harness"] === "string" ? engines["harness"] : undefined }
                : undefined,
              hooksFormat: typeof ns["hooksFormat"] === "number" ? ns["hooksFormat"] : 1,
              componentsFormat:
                typeof ns["componentsFormat"] === "number" ? ns["componentsFormat"] : 1,
            };
            if (namespace.engines?.harness !== undefined) {
              if (!satisfiesRange(SDK_VERSION, namespace.engines.harness))
                issues.push({
                  level: "error",
                  message: `engines.harness "${namespace.engines.harness}" excludes implementation ${SDK_VERSION}`,
                });
            }
            for (const key of Object.keys(ns)) {
              if (
                !["namespaceVersion", "capabilities", "engines", "hooksFormat", "componentsFormat"].includes(key)
              )
                issues.push({
                  level: "warning",
                  message: `unknown dev.anyharness field ignored: ${key}`,
                });
            }
          }
        }
      }
    }
  }

  if (issues.some((i) => i.level === "error")) return { issues };
  return {
    manifest: {
      raw: doc,
      name: name as string,
      version: version as string,
      schemaId: schemaId as string,
      namespace,
    },
    issues,
  };
};

export const parseManifestText = (
  text: string,
): { manifest?: ParsedManifest; issues: ManifestIssue[] } => {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    return {
      issues: [
        { level: "error", message: `plugin.json is not valid JSON: ${(e as Error).message}` },
      ],
    };
  }
  return validateManifest(doc);
};

/* ------------------------------------------------------------------ */
/* Package inspection — fixed-location component inventory (§5)         */
/* ------------------------------------------------------------------ */

export interface HookDeclaration {
  event: string;
  command: string;
  args: string[];
  timeout?: number;
}

export interface McpServerDecl {
  name: string;
  config: Record<string, unknown>;
}

export interface PackageInspection {
  /** Parsed plugin.json when present and valid; bare skills have none. */
  manifest?: ParsedManifest;
  issues: ManifestIssue[];
  components: ComponentRef[];
  hooks: HookDeclaration[];
  mcpServers: McpServerDecl[];
  /** Root-level SKILL.md → standalone skill package (kind `skill`). */
  standaloneSkill?: { name: string; version: string; description?: string };
  hasSetupScript: boolean;
}

const readIfExists = async (fs: FsPort, path: string): Promise<string | null> => {
  try {
    return decoder.decode(await fs.readFile(path));
  } catch {
    return null;
  }
};

const markdownNames = async (
  fs: FsPort,
  dir: string,
  kind: ExtensionKind,
): Promise<ComponentRef[]> => {
  const out: ComponentRef[] = [];
  let entries;
  try {
    entries = await fs.readDir(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.type !== "file" || !entry.name.endsWith(".md")) continue;
    const stem = basename(entry.name).replace(/\.md$/, "");
    const text = await readIfExists(fs, join(dir, entry.name));
    const fm = text === null ? {} : parseFrontmatter(text).frontmatter;
    const fmName = typeof fm["name"] === "string" ? fm["name"] : undefined;
    out.push({ kind, name: fmName ?? stem });
  }
  return out;
};

/** Parse `dev.anyharness/hooks.json` (hooksFormat 1). */
const readHooks = async (
  fs: FsPort,
  path: string,
): Promise<{ hooks: HookDeclaration[]; error?: string }> => {
  const text = await readIfExists(fs, path);
  if (text === null) return { hooks: [] };
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    return { hooks: [], error: `hooks.json invalid JSON: ${(e as Error).message}` };
  }
  if (!isPlainObject(doc) || !isPlainObject(doc["hooks"]))
    return { hooks: [], error: "hooks.json lacks a \"hooks\" object" };
  const out: HookDeclaration[] = [];
  for (const [event, entries] of Object.entries(doc["hooks"])) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!isPlainObject(entry) || typeof entry["command"] !== "string") continue;
      out.push({
        event,
        command: entry["command"],
        args: Array.isArray(entry["args"])
          ? entry["args"].filter((a): a is string => typeof a === "string")
          : [],
        timeout: typeof entry["timeout"] === "number" ? entry["timeout"] : undefined,
      });
    }
  }
  return { hooks: out };
};

/** Parse a package-root `mcp.json` (Agent Plugins §7.2 shape). */
const readPackageMcp = async (
  fs: FsPort,
  path: string,
): Promise<{ servers: McpServerDecl[]; error?: string }> => {
  const text = await readIfExists(fs, path);
  if (text === null) return { servers: [] };
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    return { servers: [], error: `mcp.json invalid JSON: ${(e as Error).message}` };
  }
  const servers: McpServerDecl[] = [];
  if (isPlainObject(doc) && isPlainObject(doc["mcpServers"])) {
    for (const [name, config] of Object.entries(doc["mcpServers"])) {
      if (isPlainObject(config)) servers.push({ name, config });
    }
  }
  return { servers };
};

/**
 * Inventory a staged/installed package directory: manifest, components at
 * their spec-fixed locations, hooks, MCP declarations, standalone-skill
 * detection.
 */
export const inspectPackage = async (
  fs: FsPort,
  pkgDir: string,
): Promise<PackageInspection> => {
  const issues: ManifestIssue[] = [];
  const components: ComponentRef[] = [];

  const manifestText = await readIfExists(fs, join(pkgDir, "plugin.json"));
  let manifest: ParsedManifest | undefined;
  if (manifestText !== null) {
    const parsed = parseManifestText(manifestText);
    manifest = parsed.manifest;
    issues.push(...parsed.issues);
  }

  // Standalone skill: root SKILL.md without a plugin.json.
  let standaloneSkill: PackageInspection["standaloneSkill"];
  const skillText = await readIfExists(fs, join(pkgDir, "SKILL.md"));
  if (manifest === undefined && skillText !== null) {
    const { frontmatter } = parseFrontmatter(skillText);
    const fm = frontmatter;
    const fmName = typeof fm["name"] === "string" ? fm["name"] : undefined;
    const fmVersion = typeof fm["version"] === "string" ? fm["version"] : undefined;
    const fmDesc = typeof fm["description"] === "string" ? fm["description"] : undefined;
    const name = fmName ?? basename(pkgDir);
    if (!isValidExtensionName(name))
      issues.push({
        level: "error",
        message: `standalone skill name "${name}" violates Agent Plugins §5.5`,
      });
    else standaloneSkill = { name, version: fmVersion ?? "0.0.0", description: fmDesc };
  }

  // skills/<dir>/ with SKILL.md → skill components.
  const skillsDir = join(pkgDir, "skills");
  try {
    for (const entry of await fs.readDir(skillsDir)) {
      if (entry.type !== "directory" && entry.type !== "symlink") continue;
      const skillMd = await fs.stat(join(skillsDir, entry.name, "SKILL.md"));
      if (skillMd !== null) components.push({ kind: "skill", name: entry.name });
    }
  } catch {
    /* absent skills/ is not an error (Agent Plugins §6.2) */
  }
  if (standaloneSkill !== undefined)
    components.push({ kind: "skill", name: standaloneSkill.name });

  // mcp.json → one mcp component per declared server key.
  const mcp = await readPackageMcp(fs, join(pkgDir, "mcp.json"));
  if (mcp.error !== undefined) issues.push({ level: "warning", message: mcp.error });
  for (const s of mcp.servers) components.push({ kind: "mcp", name: s.name });

  // dev.anyharness/ behavioral components.
  const nsDir = join(pkgDir, "dev.anyharness");
  const hooks = await readHooks(fs, join(nsDir, "hooks.json"));
  if (hooks.error !== undefined) issues.push({ level: "warning", message: hooks.error });
  for (const h of hooks.hooks)
    components.push({ kind: "hook", name: h.event });
  for (const [dir, kind] of [
    ["commands", "command"],
    ["agents", "agent"],
    ["rules", "rule"],
  ] as const) {
    for (const c of await markdownNames(fs, join(nsDir, dir), kind))
      components.push(c);
  }
  const hasSetupScript =
    (await fs.stat(join(nsDir, "setup")))?.type === "file";

  return {
    manifest,
    issues,
    components,
    hooks: hooks.hooks,
    mcpServers: mcp.servers,
    standaloneSkill,
    hasSetupScript,
  };
};
