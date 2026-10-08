/**
 * `createStore` — the AnyHarness store over `~/.agents/` (spec/store-layout.md).
 *
 * `root` is the agents root itself (`~/.agents/`); the store derives
 * `harness/`, `skills/`, `mcp.json` beneath it. Every mutation holds
 * `harness/.lock`, stages through `harness/tmp/`, and completes by atomic
 * rename; every trust-relevant event lands in `audit.log`.
 */

import { FsPort, StorePorts } from "./ports.js";
import { StoreError, conflict, notFound, policyDenied, trustViolation } from "./errors.js";
import { atomicWriteFile, copyTree, renameIntoPlace, swapDirectory } from "./atomic.js";
import { computeIntegrity, listPackageFiles, type PackageFile } from "./integrity.js";
import { emptyLockfile, encodeLockfile, readLockfile, serializeLockfile, type LockfileRead } from "./lockfile.js";
import {
  inspectPackage,
  isValidExtensionName,
  type PackageInspection,
  type ParsedManifest,
} from "./manifest.js";
import { mergeMcpServers, readRootMcp, removeMcpServers, rootMcpPathFor } from "./mcpmerge.js";
import { loadPolicy, resolveExecDecision, sourceAllowed } from "./policy.js";
import { cloneUrlFor, resolveSource } from "./sources.js";
import { appendAudit, readAudit } from "./audit.js";
import { MutexOptions, lockPathFor, withLock } from "./mutex.js";
import { dirname, join } from "./path.js";
import type {
  Actor,
  AuditEvent,
  AuditRecord,
  Extension,
  ExtensionKind,
  LockEntry,
  Lockfile,
  ManifestRef,
  SourceRef,
  TrustPolicy,
} from "./types.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const STORE_LAYOUT_VERSION = 1;
/** targets[] marker for materialization into the shared skills root (§5.1). */
export const SHARED_SKILLS_TARGET = "skills";

export interface StorePaths {
  /** `~/.agents/` (the value passed as `root`). */
  root: string;
  /** `~/.agents/harness/` — our sole owned key. */
  harness: string;
  packages: string;
  data: string;
  tmp: string;
  lockfile: string;
  config: string;
  audit: string;
  storeJson: string;
  lock: string;
  /** Shared roots we read or merge into but never own. */
  skills: string;
  mcpJson: string;
}

export const storePaths = (root: string): StorePaths => {
  const harness = join(root, "harness");
  return {
    root,
    harness,
    packages: join(harness, "packages"),
    data: join(harness, "data"),
    tmp: join(harness, "tmp"),
    lockfile: join(harness, "extensions.lock"),
    config: join(harness, "config.toml"),
    audit: join(harness, "audit.log"),
    storeJson: join(harness, "store.json"),
    lock: lockPathFor(harness),
    skills: join(root, "skills"),
    mcpJson: rootMcpPathFor(root),
  };
};

/** Approval callback — cli wires a TTY prompt; absent = non-interactive. */
export type ApproveExec = (req: {
  execClass: "setup" | "hooks" | "mcp" | "skillScripts";
  extension: ManifestRef;
  command: string;
  args: string[];
  reason: string;
}) => Promise<boolean>;

export interface StoreOptions {
  /** Actor recorded in audit events and used for policy (default "user"). */
  actor?: Actor;
  /** Implementation identifier for store.json (default "anyharness-sdk"). */
  createdBy?: string;
  /** Interactive approver for `ask` decisions; absence = no TTY. */
  approveExec?: ApproveExec;
  mutex?: MutexOptions;
}

export interface ListOptions {
  kinds?: ExtensionKind[];
  enabledOnly?: boolean;
}

export interface InstallOptions {
  actor?: Actor;
  /** Allow an existing entry to be replaced (trust.md §3.3 update path). */
  update?: boolean;
  /** Where a standalone (kind=skill) package lands. Default "shared". */
  installTarget?: "shared" | "packages";
  /** Capability slots to grant (subset of requested); default grants all requested. */
  grantCapabilities?: string[];
  approveExec?: ApproveExec;
  /** Keep staged path for tests/debug — skips rename and leaves tmp/. */
  dryRun?: boolean;
}

export interface InstallResult {
  extension: Extension;
  entry: LockEntry;
  /** Where the package tree landed (packages/<name> or skills/<name>). */
  location: string;
  warnings: string[];
}

export interface MaterializeOptions {
  target?: "store" | "inline";
  /** Skill names to materialize; default = all provided skills. */
  include?: string[];
  actor?: Actor;
}

export interface MaterializedSkill {
  name: string;
  manifest: ManifestRef;
  files: (PackageFile & { content?: string; contentBase64?: string })[];
  materializedTo?: string;
}

export interface MaterializeResult {
  skills: MaterializedSkill[];
}

export interface VerifyResult {
  ok: boolean;
  expected?: string;
  actual: string;
  extension: ManifestRef;
}

export interface DoctorFinding {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  extension?: string;
  path?: string;
}

export interface DoctorReport {
  findings: DoctorFinding[];
}

export interface StoreEntry {
  name: string;
  extension: Extension;
  entry: LockEntry;
  /** Absolute dir of the installed tree (packages/<name> or skills/<name>). */
  packageDir: string;
}

export interface StoreNotification {
  kind: string;
  data?: Record<string, unknown>;
  streamId?: string;
}

/** Pinned public surface (plan Wave 2) plus additive helpers. */
export interface Store {
  readonly root: string;
  readonly paths: StorePaths;
  readonly ports: StorePorts;
  list(opts?: ListOptions): Promise<Extension[]>;
  /** One entry by name or "<name>@<version>" id — additive helper. */
  get(nameOrId: string): Promise<StoreEntry>;
  install(source: string | SourceRef, opts?: InstallOptions): Promise<InstallResult>;
  remove(name: string, opts?: { actor?: Actor; keepData?: boolean }): Promise<Extension>;
  setEnabled(name: string, enabled: boolean, opts?: { actor?: Actor }): Promise<Extension>;
  materialize(name: string, opts?: MaterializeOptions): Promise<MaterializeResult>;
  verify(name: string, opts?: { actor?: Actor }): Promise<VerifyResult>;
  doctor(): Promise<DoctorReport>;
  /** Current effective trust policy (config.toml `[policy]`). */
  policy(): Promise<TrustPolicy>;
  /** Read the audit log (tolerating torn lines). */
  auditLog(): Promise<AuditRecord[]>;
  /** Subscribe to store-change notifications (extensions.changed et al). */
  subscribe(listener: (n: StoreNotification) => void): () => void;
  /** Internal: raw lockfile read (bridge + tests). */
  readLock(): Promise<Lockfile>;
}

/* ------------------------------------------------------------------ */

interface Ctx {
  fs: FsPort;
  ports: StorePorts;
  paths: StorePaths;
  options: StoreOptions;
  listeners: Set<(n: StoreNotification) => void>;
}

const notify = (ctx: Ctx, n: StoreNotification): void => {
  for (const l of ctx.listeners) l(n);
};

const actorOf = (ctx: Ctx, opts?: { actor?: Actor }): Actor =>
  opts?.actor ?? ctx.options.actor ?? "user";

const audit = async (
  ctx: Ctx,
  event: AuditEvent,
  fields: Omit<AuditRecord, "ts" | "event">,
): Promise<void> => {
  await appendAudit(ctx.fs, ctx.paths.audit, {
    ts: new Date().toISOString(),
    event,
    ...fields,
  });
};

/** Create the harness/ scaffold + store.json on first write (§8.3). */
const ensureStore = async (ctx: Ctx): Promise<void> => {
  for (const dir of [ctx.paths.harness, ctx.paths.packages, ctx.paths.data, ctx.paths.tmp])
    await ctx.fs.mkdir(dir);
  const st = await ctx.fs.stat(ctx.paths.storeJson);
  if (st !== null) {
    try {
      const doc = JSON.parse(decoder.decode(await ctx.fs.readFile(ctx.paths.storeJson)));
      const lv = doc?.layoutVersion;
      if (typeof lv === "number" && lv > STORE_LAYOUT_VERSION)
        throw new StoreError(
          "invalid",
          `store layoutVersion ${lv} > supported ${STORE_LAYOUT_VERSION}`,
          { layoutVersion: lv },
        );
    } catch (e) {
      if (e instanceof StoreError) throw e;
      throw new StoreError("invalid", `store.json is unreadable: ${(e as Error).message}`);
    }
    return;
  }
  await atomicWriteFile(
    ctx.fs,
    ctx.paths.storeJson,
    encoder.encode(
      JSON.stringify(
        {
          layoutVersion: STORE_LAYOUT_VERSION,
          createdAt: new Date().toISOString(),
          createdBy: ctx.options.createdBy ?? "anyharness-sdk",
        },
        null,
        2,
      ) + "\n",
    ),
  );
};

/** Read the lockfile; on corruption stash the file aside once. */
const loadLock = async (ctx: Ctx): Promise<LockfileRead> => {
  const read = await readLockfile(ctx.fs, ctx.paths.lockfile);
  if (read.corrupt !== undefined) {
    // Preserve the corrupt file before any future write (lockfile.md §2.4).
    const aside = `${ctx.paths.lockfile}.corrupt-${Date.now()}`;
    await ctx.fs.rename(ctx.paths.lockfile, aside).catch(() => undefined);
    await audit(ctx, "lockfile.corrupt", {
      actor: actorOf(ctx),
      details: { reason: read.corrupt.reason, preservedAs: aside },
    }).catch(() => undefined);
  }
  return read;
};

const writeLock = async (ctx: Ctx, lock: Lockfile): Promise<void> => {
  await atomicWriteFile(ctx.fs, ctx.paths.lockfile, encodeLockfile(lock));
};

/* ---------------- extension <-> entry mapping ---------------------- */

const providesOf = (entry: LockEntry): ExtensionKind[] => {
  if (entry.components === undefined || entry.components.length === 0)
    return [entry.kind];
  const kinds = new Set<ExtensionKind>();
  for (const c of entry.components) kinds.add(c.kind);
  kinds.delete(entry.kind);
  return kinds.size === 0 ? [entry.kind] : [...kinds];
};

const toExtension = (name: string, entry: LockEntry): Extension => ({
  id: `${name}@${entry.manifest.version}`,
  kind: entry.kind,
  manifest: {
    name: entry.manifest.name,
    version: entry.manifest.version,
    integrity: entry.integrity,
  },
  enabled: entry.enabled !== false,
  provides: providesOf(entry),
});

/** Installed-tree location: standalone skills live in the shared root. */
const packageDirOf = (ctx: Ctx, name: string, entry: LockEntry): string =>
  entry.kind === "skill" && (entry.targets ?? []).includes(SHARED_SKILLS_TARGET)
    ? join(ctx.paths.skills, name)
    : join(ctx.paths.packages, name);

const lookupName = (lock: Lockfile, nameOrId: string): string => {
  if (nameOrId in lock.extensions) return nameOrId;
  const at = nameOrId.lastIndexOf("@");
  if (at > 0) {
    const name = nameOrId.slice(0, at);
    if (name in lock.extensions) return name;
  }
  throw notFound("extension", nameOrId);
};

/* ------------------------------- staging -------------------------- */

const stageId = (): string =>
  `stage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const runGit = async (
  ctx: Ctx,
  args: string[],
  cwd?: string,
): Promise<{ stdout: string; stderr: string }> => {
  const res = await ctx.ports.exec.run("git", args, { cwd });
  if (res.code !== 0)
    throw new StoreError("invalid", `git ${args[0]} failed: ${res.stderr.trim()}`, {
      command: "git",
      args,
      code: res.code,
    });
  return { stdout: res.stdout, stderr: res.stderr };
};

/**
 * Fetch a source into `stageDir` (contents directly at the stage root).
 * Returns the resolved `source` (refs pinned for git/github).
 */
const fetchInto = async (
  ctx: Ctx,
  source: SourceRef,
  stageDir: string,
): Promise<SourceRef> => {
  await ctx.fs.mkdir(stageDir);
  if (source.type === "local") {
    const srcAbs = source.uri.startsWith("/")
      ? source.uri
      : join(ctx.paths.root, source.uri); // store-relative per lockfile §3.3
    const st = await ctx.fs.stat(srcAbs);
    if (st === null || st.type !== "directory")
      throw notFound("source", source.uri);
    await copyTree(ctx.fs, srcAbs, stageDir);
    // .git is source bookkeeping, never package content.
    await ctx.fs.remove(join(stageDir, ".git"), { recursive: true });
    return source;
  }
  if (source.type === "registry")
    throw new StoreError(
      "invalid",
      "registry sources resolve through an index; no index is configured in this build",
      { source: source.uri },
    );

  // git / github → clone, pin, strip .git.
  const url = cloneUrlFor(source);
  const cloneDir = `${stageDir}-clone`;
  await runGit(ctx, ["clone", "--quiet", url, cloneDir]);
  if (source.ref !== undefined) {
    const wanted = source.ref;
    await runGit(ctx, ["fetch", "--quiet", "--depth", "1", "origin", wanted], cloneDir).catch(
      () => runGit(ctx, ["fetch", "--quiet", "origin", wanted], cloneDir),
    );
    await runGit(ctx, ["checkout", "--quiet", "--detach", "FETCH_HEAD"], cloneDir);
  }
  const head = (await runGit(ctx, ["rev-parse", "HEAD"], cloneDir)).stdout.trim();
  const pkgRoot = source.path !== undefined ? join(cloneDir, source.path) : cloneDir;
  const st = await ctx.fs.stat(pkgRoot);
  if (st === null || st.type !== "directory")
    throw new StoreError("invalid", `source path absent: ${source.path ?? "/"}`);
  await ctx.fs.remove(join(pkgRoot, ".git"), { recursive: true });
  if (pkgRoot !== cloneDir) {
    await ctx.fs.rename(pkgRoot, stageDir);
    await ctx.fs.remove(cloneDir, { recursive: true });
  } else {
    await ctx.fs.rename(cloneDir, stageDir);
  }
  return { ...source, ref: head };
};

/* ------------------------------- install --------------------------- */

const installOne = async (
  ctx: Ctx,
  sourceInput: string | SourceRef,
  opts: InstallOptions,
): Promise<InstallResult> => {
  const actor = actorOf(ctx, opts);
  const requested =
    typeof sourceInput === "string" ? resolveSource(sourceInput) : sourceInput;

  const { policy } = await loadPolicy(ctx.fs, ctx.paths.config);
  if (!sourceAllowed(policy, requested)) {
    await audit(ctx, "install", {
      actor,
      decision: "deny",
      source: requested,
      details: { reason: "source not allowed by policy" },
    });
    throw policyDenied("sources.allow/sources.deny", `source denied by policy: ${requested.uri}`);
  }

  return withLock(ctx.fs, ctx.paths.lock, ctx.options.mutex ?? {}, async () => {
    await ensureStore(ctx);
    const lockRead = await loadLock(ctx);
    const lock = lockRead.lockfile;

    const stageDir = join(ctx.paths.tmp, stageId());
    let resolved: SourceRef;
    try {
      resolved = await fetchInto(ctx, requested, stageDir);
    } catch (e) {
      await ctx.fs.remove(stageDir, { recursive: true }).catch(() => undefined);
      throw e;
    }

    const finish = async (err?: unknown): Promise<never> => {
      await ctx.fs.remove(stageDir, { recursive: true }).catch(() => undefined);
      throw err ?? new StoreError("internal", "install aborted");
    };

    // Inspect staged tree.
    const inspection = await inspectPackage(ctx.fs, stageDir);
    const fatal = inspection.issues.filter((i) => i.level === "error");
    if (inspection.manifest === undefined && inspection.standaloneSkill === undefined)
      await finish(new StoreError("manifest-invalid",
        "no plugin.json and no root SKILL.md — not a package", {
          issues: inspection.issues.map((i) => i.message),
        }));
    if (fatal.length > 0)
      await finish(new StoreError("manifest-invalid",
        `manifest invalid: ${fatal.map((i) => i.message).join("; ")}`, {
          issues: inspection.issues.map((i) => i.message),
        }));

    const isSkill = inspection.standaloneSkill !== undefined;
    const name = isSkill
      ? inspection.standaloneSkill!.name
      : inspection.manifest!.name;
    const version = isSkill
      ? inspection.standaloneSkill!.version
      : inspection.manifest!.version;
    const manifestRef: ManifestRef = { name, version };
    const kind: ExtensionKind = isSkill ? "skill" : "plugin";
    const installTarget = isSkill ? (opts.installTarget ?? "shared") : "packages";

    if (!isValidExtensionName(name))
      await finish(new StoreError("manifest-invalid",
        `extension name violates Agent Plugins §5.5: ${name}`));

    const existing = lock.extensions[name];
    if (existing !== undefined && opts.update !== true)
      await finish(conflict(
        `extension already installed: ${name} (use update to replace)`));

    const destDir =
      installTarget === "shared"
        ? join(ctx.paths.skills, name)
        : join(ctx.paths.packages, name);

    // §7.3.3: never shadow a foreign skills/<name>/ dir.
    if (installTarget === "shared") {
      const destStat = await ctx.fs.stat(destDir);
      const weManage = existing !== undefined;
      if (destStat !== null && !weManage) {
        await audit(ctx, "skills.conflict", {
          actor,
          extension: manifestRef,
          details: { dir: destDir, reason: "foreign skill directory exists" },
        });
        await finish(conflict(
          `skills/${name} exists and is not AnyHarness-managed — refusing to shadow a foreign skill`));
      }
    } else {
      const destStat = await ctx.fs.stat(destDir);
      if (destStat !== null && existing === undefined)
        await finish(conflict(
          `packages/${name} exists without a lock entry — refusing to overwrite an orphan`));
    }

    // Integrity over the staged tree (pre-rename content is post-rename content).
    const integrity = await computeIntegrity(ctx.fs, stageDir);

    // Capability grant: requested ∩ granted (default: grant all requested).
    const requestedCaps = inspection.manifest?.namespace?.capabilities ?? [];
    const grantedCaps = opts.grantCapabilities === undefined
      ? requestedCaps
      : requestedCaps.filter((c) => opts.grantCapabilities!.includes(c));

    if (opts.dryRun === true) {
      const entry: LockEntry = {
        kind,
        manifest: manifestRef,
        source: resolved,
        integrity,
        installedAt: existing?.installedAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        targets: installTarget === "shared" ? [SHARED_SKILLS_TARGET] : existing?.targets ?? [],
        components: inspection.components,
        capabilities: grantedCaps,
        enabled: existing?.enabled,
      };
      return { // dry-run: nothing moved, nothing written
        extension: toExtension(name, entry),
        entry,
        location: stageDir,
        warnings: inspection.issues.map((i) => i.message),
      } satisfies InstallResult;
    }

    // Move into place (atomic rename; swap on update).
    await ctx.fs.mkdir(dirname(destDir));
    if (existing !== undefined || (await ctx.fs.stat(destDir)) !== null)
      await swapDirectory(ctx.fs, stageDir, destDir);
    else await renameIntoPlace(ctx.fs, stageDir, destDir);
    await ctx.fs.mkdir(join(ctx.paths.data, name));

    // dev.anyharness/setup — script policy decides whether it runs.
    if (inspection.hasSetupScript) {
      const decision = resolveExecDecision(policy, "setup", actor, resolved);
      let runAllowed = decision === "allow";
      if (decision === "ask" && opts.approveExec !== undefined)
        runAllowed = await opts.approveExec({
          execClass: "setup",
          extension: manifestRef,
          command: join(destDir, "dev.anyharness", "setup"),
          args: [],
          reason: "dev.anyharness/setup install script",
        });
      if (runAllowed) {
        await audit(ctx, "exec.allow", { actor, extension: manifestRef, decision: "allow", details: { class: "setup" } });
        const res = await ctx.ports.exec.run(join(destDir, "dev.anyharness", "setup"), [], {
          cwd: destDir,
          env: { PLUGIN_ROOT: destDir, PLUGIN_DATA: join(ctx.paths.data, name) },
        });
        if (res.code !== 0) {
          await swapDirectory(ctx.fs, destDir, join(ctx.paths.tmp, `${stageId()}-rollback`));
          await audit(ctx, "install", { actor, extension: manifestRef, decision: "deny", source: resolved, details: { setupFailed: true, code: res.code } });
          throw new StoreError("invalid", `setup script failed (exit ${res.code})`, { stderr: res.stderr.slice(0, 2000) });
        }
      } else {
        await audit(ctx, "exec.deny", { actor, extension: manifestRef, decision: "deny", details: { class: "setup", resolved: decision } });
      }
    }

    // mcp.json merge — only member names we declare.
    let mcpMerged = false;
    if (inspection.mcpServers.length > 0) {
      await mergeMcpServers(
        ctx.fs,
        ctx.paths.mcpJson,
        inspection.mcpServers,
        destDir,
        join(ctx.paths.data, name),
      );
      mcpMerged = true;
    }

    const now = new Date().toISOString();
    const entry: LockEntry = {
      kind,
      manifest: manifestRef,
      source: resolved,
      integrity,
      installedAt: existing?.installedAt ?? now,
      updatedAt: now,
      targets: [
        ...new Set([
          ...(installTarget === "shared"
            ? [...(existing?.targets ?? []), SHARED_SKILLS_TARGET]
            : (existing?.targets ?? []).filter((t) => t !== SHARED_SKILLS_TARGET)),
          ...(mcpMerged ? ["mcp"] : []),
        ]),
      ],
      components: inspection.components,
      capabilities: grantedCaps,
      enabled: existing?.enabled ?? true,
    };

    lock.extensions[name] = entry;
    await writeLock(ctx, lock);
    await audit(ctx, existing !== undefined ? "update" : "install", {
      actor,
      extension: manifestRef,
      integrity,
      source: resolved,
    });
    notify(ctx, {
      kind: "extensions.changed",
      data: existing !== undefined ? { updated: [name] } : { added: [name] },
    });

    return {
      extension: toExtension(name, entry),
      entry,
      location: destDir,
      warnings: inspection.issues.map((i) => i.message),
    } satisfies InstallResult;
  });
};

/* ------------------------------- remove ---------------------------- */

const removeOne = async (
  ctx: Ctx,
  nameOrId: string,
  opts: { actor?: Actor; keepData?: boolean },
): Promise<Extension> => {
  const actor = actorOf(ctx, opts);
  return withLock(ctx.fs, ctx.paths.lock, ctx.options.mutex ?? {}, async () => {
    const lockRead = await loadLock(ctx);
    const lock = lockRead.lockfile;
    const name = lookupName(lock, nameOrId);
    const entry = lock.extensions[name];
    const dir = packageDirOf(ctx, name, entry);

    // Only remove a skills/<name>/ dir we manage (§7.3).
    if (dir.startsWith(ctx.paths.skills + "/") || dir === ctx.paths.skills)
      if (!entry.targets.includes(SHARED_SKILLS_TARGET))
        throw policyDenied("skills/ownership", `skills/${name} is not AnyHarness-managed`);

    await ctx.fs.remove(dir, { recursive: true });
    if (opts.keepData !== true)
      await ctx.fs.remove(join(ctx.paths.data, name), { recursive: true });

    const mcpNames = (entry.components ?? [])
      .filter((c) => c.kind === "mcp")
      .map((c) => c.name);
    if (mcpNames.length > 0)
      await removeMcpServers(ctx.fs, ctx.paths.mcpJson, mcpNames);

    delete lock.extensions[name];
    await writeLock(ctx, lock);
    await audit(ctx, "remove", {
      actor,
      extension: { name, version: entry.manifest.version },
    });
    notify(ctx, { kind: "extensions.changed", data: { removed: [name] } });
    return toExtension(name, entry);
  });
};

/* --------------------------- materialize --------------------------- */

const readSkillFiles = async (
  fs: FsPort,
  dir: string,
  inline: boolean,
): Promise<(PackageFile & { content?: string; contentBase64?: string })[]> => {
  const files = await listPackageFiles(fs, dir);
  if (!inline) return files;
  const out: (PackageFile & { content?: string; contentBase64?: string })[] = [];
  for (const f of files) {
    const abs = join(dir, f.path);
    const st = await fs.stat(abs);
    if (st?.type === "symlink") {
      const target = await fs.readlink(abs);
      const resolved = target.startsWith("/") ? target : join(dirname(abs), target);
      const data = await fs.readFile(resolved);
      out.push({ ...f, contentBase64: encodeBinary(data) });
      continue;
    }
    const data = await fs.readFile(abs);
    const text = tryDecodeText(data);
    out.push(text !== null ? { ...f, content: text } : { ...f, contentBase64: encodeBinary(data) });
  }
  return out;
};

const tryDecodeText = (data: Uint8Array): string | null => {
  if (data.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    return null;
  }
};

const encodeBinary = (data: Uint8Array): string => {
  let s = "";
  for (const b of data) s += String.fromCharCode(b);
  // base64 without btoa (not universal in non-secure contexts)
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < data.length; i += 3) {
    const b0 = data[i], b1 = data[i + 1], b2 = data[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += i + 1 < data.length ? B64[((b1 ?? 0) & 0xf) << 2 | ((b2 ?? 0) >> 6)] : "=";
    out += i + 2 < data.length ? B64[(b2 ?? 0) & 0x3f] : "=";
  }
  return out;
};

/** Skill dirs a package contributes: {dirName → abs path under pkg}. */
const skillDirsOf = async (
  ctx: Ctx,
  pkgDir: string,
  inspection?: PackageInspection,
): Promise<{ name: string; dir: string }[]> => {
  const insp = inspection ?? (await inspectPackage(ctx.fs, pkgDir));
  const out: { name: string; dir: string }[] = [];
  for (const c of insp.components) {
    if (c.kind !== "skill") continue;
    if (insp.standaloneSkill !== undefined && c.name === insp.standaloneSkill.name) {
      out.push({ name: c.name, dir: pkgDir });
      continue;
    }
    const dir = join(pkgDir, "skills", c.name);
    if ((await ctx.fs.stat(join(dir, "SKILL.md"))) !== null)
      out.push({ name: c.name, dir });
  }
  return out;
};

/** Skill dirs the lockfile says `name` manages in the shared root. */
const managedSkillsFor = (entry: LockEntry): string[] =>
  entry.targets.includes(SHARED_SKILLS_TARGET)
    ? (entry.components ?? []).filter((c) => c.kind === "skill").map((c) => c.name)
    : [];

const materializeOne = async (
  ctx: Ctx,
  nameOrId: string,
  opts: MaterializeOptions,
): Promise<MaterializeResult> => {
  const actor = actorOf(ctx, opts);
  const lockRead = await loadLock(ctx);
  const name = lookupName(lockRead.lockfile, nameOrId);
  const entry = lockRead.lockfile.extensions[name];
  if (entry.enabled === false)
    throw new StoreError("invalid", `extension disabled: ${name}`);
  const pkgDir = packageDirOf(ctx, name, entry);

  // Trust gate: verify before exposing content (trust.md §3.2).
  const actual = await computeIntegrity(ctx.fs, pkgDir);
  if (actual !== entry.integrity) {
    await audit(ctx, "integrity.fail", {
      actor,
      extension: { name, version: entry.manifest.version },
      integrity: actual,
      details: { expected: entry.integrity },
    });
    throw trustViolation(entry.integrity, actual);
  }

  const skills = await skillDirsOf(ctx, pkgDir);
  const wanted = opts.include === undefined
    ? skills
    : skills.filter((s) => opts.include!.includes(s.name));
  if (wanted.length === 0)
    throw notFound("skill", opts.include?.join(",") ?? name);

  const target = opts.target ?? "store";
  const result: MaterializedSkill[] = [];

  if (target === "store") {
    return withLock(ctx.fs, ctx.paths.lock, ctx.options.mutex ?? {}, async () => {
      const inner = await readLockfile(ctx.fs, ctx.paths.lockfile);
      const innerEntry = inner.lockfile.extensions[name];
      if (innerEntry === undefined) throw notFound("extension", name);
      const managed = new Set(managedSkillsFor(innerEntry));
      for (const skill of wanted) {
        const dest = join(ctx.paths.skills, skill.name);
        const exists = (await ctx.fs.stat(dest)) !== null;
        const alreadyOurs =
          managed.has(skill.name) ||
          (innerEntry.kind === "skill" && skill.name === name);
        if (exists && !alreadyOurs) {
          await audit(ctx, "skills.conflict", {
            actor,
            extension: { name, version: innerEntry.manifest.version },
            details: { dir: dest, skill: skill.name },
          });
          throw conflict(
            `skills/${skill.name} exists and is foreign — refusing to overwrite (§7.3)`);
        }
        await ctx.fs.mkdir(ctx.paths.skills);
        if (exists) await ctx.fs.remove(dest, { recursive: true });
        await copyTree(ctx.fs, skill.dir, dest);
        result.push({
          name: skill.name,
          manifest: { name, version: innerEntry.manifest.version, integrity: innerEntry.integrity },
          files: await readSkillFiles(ctx.fs, dest, false),
          materializedTo: dest,
        });
      }
      innerEntry.targets = [...new Set([...innerEntry.targets, SHARED_SKILLS_TARGET])];
      innerEntry.updatedAt = new Date().toISOString();
      await writeLock(ctx, inner.lockfile);
      await audit(ctx, "integrity.verify", {
        actor,
        extension: { name, version: innerEntry.manifest.version },
        integrity: innerEntry.integrity,
        details: { materialized: wanted.map((s) => s.name) },
      });
      return { skills: result } satisfies MaterializeResult;
    });
  }

  // inline
  for (const skill of wanted)
    result.push({
      name: skill.name,
      manifest: { name, version: entry.manifest.version, integrity: entry.integrity },
      files: await readSkillFiles(ctx.fs, skill.dir, true),
    });
  return { skills: result };
};

/* ------------------------------- verify ---------------------------- */

const verifyOne = async (
  ctx: Ctx,
  nameOrId: string,
  opts: { actor?: Actor },
): Promise<VerifyResult> => {
  const actor = actorOf(ctx, opts);
  const lockRead = await loadLock(ctx);
  const name = lookupName(lockRead.lockfile, nameOrId);
  const entry = lockRead.lockfile.extensions[name];
  const pkgDir = packageDirOf(ctx, name, entry);
  if ((await ctx.fs.stat(pkgDir)) === null)
    throw notFound("extension", name);
  const actual = await computeIntegrity(ctx.fs, pkgDir);
  const ok = actual === entry.integrity;
  await audit(ctx, ok ? "integrity.verify" : "integrity.fail", {
    actor,
    extension: { name, version: entry.manifest.version },
    integrity: actual,
    details: ok ? undefined : { expected: entry.integrity },
  });
  return { ok, expected: entry.integrity, actual, extension: { name, version: entry.manifest.version } };
};

/* ------------------------------- doctor ---------------------------- */

const KNOWN_HARNESS_ENTRIES = new Set([
  "store.json", "packages", "data", "extensions.lock", "config.toml",
  "audit.log", "tmp", ".lock", "serve.json",
]);

const doctorScan = async (ctx: Ctx): Promise<DoctorReport> => {
  const findings: DoctorFinding[] = [];
  const push = (f: DoctorFinding): void => void findings.push(f);

  const harnessStat = await ctx.fs.stat(ctx.paths.harness);
  if (harnessStat === null) return { findings }; // no store yet — nothing to say

  const storeJsonStat = await ctx.fs.stat(ctx.paths.storeJson);
  if (storeJsonStat === null)
    push({ code: "store-json.missing", severity: "warning", message: "store.json missing in a non-empty harness/", path: ctx.paths.storeJson });
  else {
    try {
      const doc = JSON.parse(decoder.decode(await ctx.fs.readFile(ctx.paths.storeJson)));
      if (typeof doc?.layoutVersion === "number" && doc.layoutVersion > STORE_LAYOUT_VERSION)
        push({ code: "store-json.version", severity: "error", message: `layoutVersion ${doc.layoutVersion} exceeds supported ${STORE_LAYOUT_VERSION}`, path: ctx.paths.storeJson });
    } catch {
      push({ code: "store-json.invalid", severity: "error", message: "store.json is not valid JSON", path: ctx.paths.storeJson });
    }
  }

  // Lockfile vs directories.
  const lockRead = await readLockfile(ctx.fs, ctx.paths.lockfile).catch(
    (e): LockfileRead => ({
      lockfile: emptyLockfile(),
      corrupt: { reason: (e as Error).message },
    }),
  );
  if (lockRead.corrupt !== undefined)
    push({ code: "lockfile.corrupt", severity: "error", message: `extensions.lock corrupt: ${lockRead.corrupt.reason}`, path: ctx.paths.lockfile });
  const lock = lockRead.lockfile;

  let pkgDirs: string[] = [];
  try {
    pkgDirs = (await ctx.fs.readDir(ctx.paths.packages))
      .filter((e) => e.type === "directory")
      .map((e) => e.name);
  } catch { /* absent */ }

  for (const [name, entry] of Object.entries(lock.extensions)) {
    const dir = packageDirOf(ctx, name, entry);
    if ((await ctx.fs.stat(dir)) === null) {
      push({ code: "package.missing", severity: "error", message: `lock entry has no installed directory: ${dir}`, extension: name, path: dir });
      continue;
    }
    try {
      const actual = await computeIntegrity(ctx.fs, dir);
      if (actual !== entry.integrity)
        push({ code: "integrity.mismatch", severity: "error", message: `integrity drift: expected ${entry.integrity}, computed ${actual}`, extension: name, path: dir });
    } catch (e) {
      push({ code: "integrity.unverifiable", severity: "error", message: (e as Error).message, extension: name, path: dir });
    }
  }
  for (const dirName of pkgDirs)
    if (!(dirName in lock.extensions))
      push({ code: "package.orphan", severity: "warning", message: `packages/${dirName} has no lock entry`, path: join(ctx.paths.packages, dirName) });

  // Foreign entries under harness/ (§4.5).
  try {
    for (const e of await ctx.fs.readDir(ctx.paths.harness))
      if (!KNOWN_HARNESS_ENTRIES.has(e.name))
        push({ code: "harness.foreign-entry", severity: "info", message: `unrecognized entry under harness/: ${e.name}`, path: join(ctx.paths.harness, e.name) });
  } catch { /* absent */ }

  // tmp/ residue (crashed installs).
  try {
    for (const e of await ctx.fs.readDir(ctx.paths.tmp))
      push({ code: "tmp.residue", severity: "info", message: `staged install residue: tmp/${e.name} (readers must ignore)`, path: join(ctx.paths.tmp, e.name) });
  } catch { /* absent */ }

  // mcp.json dialect check (§5.2.4).
  const mcp = await readRootMcp(ctx.fs, ctx.paths.mcpJson);
  if (mcp.foreignDialect !== undefined)
    push({ code: "mcp.foreign-dialect", severity: "warning", message: `root mcp.json not mergeable: ${mcp.foreignDialect}`, path: ctx.paths.mcpJson });
  if (mcp.mcpServers !== null) {
    const managed = new Set<string>();
    for (const entry of Object.values(lock.extensions))
      for (const c of entry.components ?? [])
        if (c.kind === "mcp") managed.add(c.name);
    for (const name of managed)
      if (!(name in mcp.mcpServers))
        push({ code: "mcp.missing-member", severity: "warning", message: `managed mcpServers member absent from root mcp.json: ${name}`, path: ctx.paths.mcpJson });
  }

  // skills/ reconciliation (§7.3): our claims vs disk vs skills.sh lock.
  const managedSkillDirs = new Map<string, string>();
  for (const [name, entry] of Object.entries(lock.extensions))
    for (const skillName of managedSkillsFor(entry))
      managedSkillDirs.set(skillName, name);
  let skillsSh: Record<string, unknown> | null = null;
  try {
    const doc = JSON.parse(decoder.decode(await ctx.fs.readFile(join(ctx.paths.root, ".skill-lock.json"))));
    skillsSh = typeof doc === "object" && doc !== null ? (doc["skills"] as Record<string, unknown> ?? doc) : null;
  } catch { /* absent/foreign — fine */ }
  let skillDirs: string[] = [];
  try {
    skillDirs = (await ctx.fs.readDir(ctx.paths.skills))
      .filter((e) => e.type === "directory" || e.type === "symlink")
      .map((e) => e.name);
  } catch { /* absent */ }
  for (const dirName of skillDirs) {
    const owner = managedSkillDirs.get(dirName);
    if (owner !== undefined) continue;
    if (skillsSh !== null && dirName in skillsSh)
      push({ code: "skills.foreign-skills-sh", severity: "info", message: `skills/${dirName} is skills.sh-managed — left alone`, path: join(ctx.paths.skills, dirName) });
    else
      push({ code: "skills.foreign", severity: "info", message: `skills/${dirName} is foreign (not AnyHarness-managed)`, path: join(ctx.paths.skills, dirName) });
  }
  for (const [skillName, owner] of managedSkillDirs)
    if (!skillDirs.includes(skillName))
      push({ code: "skills.missing", severity: "error", message: `materialized skills/${skillName} for ${owner} is absent`, extension: owner, path: join(ctx.paths.skills, skillName) });

  // audit.log presence (§6.3.4 — evidence, not enforcement).
  if (Object.keys(lock.extensions).length > 0 && (await ctx.fs.stat(ctx.paths.audit)) === null)
    push({ code: "audit.missing", severity: "warning", message: "audit.log absent on a store with installed extensions", path: ctx.paths.audit });

  // A held (possibly stale) lock is informational.
  const lockStat = await ctx.fs.stat(ctx.paths.lock);
  if (lockStat !== null)
    push({ code: "lock.held", severity: "info", message: ".lock file present — a writer is active or a stale lock remains", path: ctx.paths.lock });

  return { findings };
};

/* ------------------------------- factory --------------------------- */

export function createStore(root: string, ports: StorePorts, options?: StoreOptions): Store {
  const paths = storePaths(root);
  const ctx: Ctx = {
    fs: ports.fs,
    ports,
    paths,
    options: options ?? {},
    listeners: new Set(),
  };

  const getEntry = async (nameOrId: string): Promise<StoreEntry> => {
    const lockRead = await loadLock(ctx);
    const name = lookupName(lockRead.lockfile, nameOrId);
    const entry = lockRead.lockfile.extensions[name];
    return {
      name,
      entry,
      extension: toExtension(name, entry),
      packageDir: packageDirOf(ctx, name, entry),
    };
  };

  return {
    root,
    paths,
    ports,

    async list(opts?: ListOptions): Promise<Extension[]> {
      const lockRead = await loadLock(ctx);
      let out = Object.entries(lockRead.lockfile.extensions).map(([n, e]) => toExtension(n, e));
      if (opts?.enabledOnly !== false)
        out = out.filter((e) => e.enabled);
      if (opts?.kinds !== undefined && opts.kinds.length > 0)
        out = out.filter(
          (e) => opts.kinds!.includes(e.kind) ||
            (e.provides ?? []).some((k) => opts.kinds!.includes(k)),
        );
      return out;
    },

    get: getEntry,

    install: (source, opts) => installOne(ctx, source, opts ?? {}),

    remove: (name, opts) => removeOne(ctx, name, opts ?? {}),

    async setEnabled(nameOrId, enabled, opts): Promise<Extension> {
      const actor = actorOf(ctx, opts);
      return withLock(ctx.fs, ctx.paths.lock, ctx.options.mutex ?? {}, async () => {
        const lockRead = await loadLock(ctx);
        const name = lookupName(lockRead.lockfile, nameOrId);
        const entry = lockRead.lockfile.extensions[name];
        entry.enabled = enabled;
        entry.updatedAt = new Date().toISOString();
        await writeLock(ctx, lockRead.lockfile);
        // Audit has no enable/disable event in the closed enum — noted in
        // the report as a spec gap; the lock write is itself atomic.
        void actor;
        notify(ctx, { kind: "extensions.changed", data: { updated: [name] } });
        return toExtension(name, entry);
      });
    },

    materialize: (name, opts) => materializeOne(ctx, name, opts ?? {}),

    verify: (name, opts) => verifyOne(ctx, name, opts ?? {}),

    doctor: () => doctorScan(ctx),

    policy: async () => (await loadPolicy(ctx.fs, ctx.paths.config)).policy,

    auditLog: async () => (await readAudit(ctx.fs, ctx.paths.audit)).records,

    subscribe(listener) {
      ctx.listeners.add(listener);
      return () => void ctx.listeners.delete(listener);
    },

    readLock: async () => (await loadLock(ctx)).lockfile,
  };
}

export { resolveSource, serializeLockfile };
export type { PackageInspection, ParsedManifest };
export { validateManifest, inspectPackage } from "./manifest.js";
export { computeIntegrity } from "./integrity.js";
export { parsePolicyText, DEFAULT_POLICY } from "./policy.js";
