/**
 * Hand-rolled in-memory Store for tests — implements the sdk's Store
 * surface without touching node or the filesystem. Exported so sibling
 * workstreams can reuse it for their own cli-side tests.
 */
import type {
  AuditRecord,
  DoctorReport,
  Extension,
  InstallOptions,
  InstallResult,
  MaterializeResult,
  SourceRef,
  Store,
  StoreEntry,
  StoreNotification,
  StorePaths,
  TrustPolicy,
  VerifyResult,
} from "../api.js";

export interface MockStore extends Store {
  /** Test inspection: lock-entry-shaped records keyed by extension name. */
  entries: Map<string, { extension: Extension; tampered: boolean }>;
  /** Test inspection: install calls as received. */
  installs: { source: SourceRef | string; opts?: InstallOptions }[];
  /** Test seeding: audit records `auditLog()` returns. */
  audit: AuditRecord[];
}

const idOf = (name: string, version: string): string => `${name}@${version}`;

const pathsOf = (root: string): StorePaths => ({
  root,
  harness: `${root}/harness`,
  packages: `${root}/harness/packages`,
  data: `${root}/harness/data`,
  tmp: `${root}/harness/tmp`,
  lockfile: `${root}/harness/extensions.lock`,
  config: `${root}/harness/config.toml`,
  audit: `${root}/harness/audit.log`,
  storeJson: `${root}/harness/store.json`,
  lock: `${root}/harness/.lock`,
  skills: `${root}/skills`,
  mcpJson: `${root}/mcp.json`,
});

export const createMockStore = (
  seed: Extension[] = [],
  root = "/test/.agents",
): MockStore => {
  const entries = new Map<string, { extension: Extension; tampered: boolean }>();
  for (const e of seed) entries.set(e.manifest.name, { extension: e, tampered: false });
  const installs: { source: SourceRef | string; opts?: InstallOptions }[] = [];
  const audit: AuditRecord[] = [];
  const listeners = new Set<(n: StoreNotification) => void>();

  const find = (name: string) => {
    const entry = entries.get(name) ?? entries.get(name.split("@")[0]);
    if (!entry) throw new Error(`extension not found: ${name}`);
    return entry;
  };

  const store: MockStore = {
    entries,
    installs,
    audit,
    root,
    paths: pathsOf(root),
    ports: {} as Store["ports"],

    list: async (opts) => {
      let out = [...entries.values()].map((e) => e.extension);
      if (opts?.enabledOnly) out = out.filter((e) => e.enabled);
      if (opts?.kinds?.length) {
        out = out.filter(
          (e) =>
            opts.kinds!.includes(e.kind) ||
            e.provides?.some((p) => opts.kinds!.includes(p)) === true,
        );
      }
      return out;
    },

    get: async (nameOrId): Promise<StoreEntry> => {
      const entry = find(nameOrId);
      return {
        name: entry.extension.manifest.name,
        extension: entry.extension,
        entry: {
          kind: entry.extension.kind,
          manifest: entry.extension.manifest,
          source: { type: "local", uri: "/mock" },
          integrity: "sha256-mock",
          installedAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          targets: [],
        },
        packageDir: `${root}/harness/packages/${entry.extension.manifest.name}`,
      };
    },

    install: async (source, opts): Promise<InstallResult> => {
      const src: SourceRef =
        typeof source === "string" ? { type: "git", uri: source } : source;
      installs.push({ source: src, ...(opts ? { opts } : {}) });
      const name =
        src.path?.split("/").pop() ?? src.uri.split("/").pop() ?? src.uri;
      const extension: Extension = {
        id: idOf(name, "1.0.0"),
        kind: "plugin",
        manifest: { name, version: "1.0.0" },
        enabled: true,
      };
      entries.set(name, { extension, tampered: false });
      return {
        extension,
        entry: {
          kind: extension.kind,
          manifest: extension.manifest,
          source: src,
          integrity: "sha256-mock",
          installedAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          targets: [],
        },
        location: `${root}/harness/packages/${name}`,
        warnings: [],
      };
    },

    remove: async (name) => {
      const entry = find(name);
      entries.delete(entry.extension.manifest.name);
      return entry.extension;
    },

    setEnabled: async (name, enabled) => {
      const entry = find(name);
      entry.extension = { ...entry.extension, enabled };
      return entry.extension;
    },

    materialize: async (name): Promise<MaterializeResult> => {
      find(name);
      return {
        skills: [
          {
            name,
            manifest: { name, version: "1.0.0" },
            files: [],
            materializedTo: `${root}/skills/${name}`,
          },
        ],
      };
    },

    verify: async (name): Promise<VerifyResult> => {
      const entry = find(name);
      return entry.tampered
        ? {
            ok: false,
            expected: "sha256-aaa",
            actual: "sha256-bbb",
            extension: entry.extension.manifest,
          }
        : {
            ok: true,
            expected: "sha256-aaa",
            actual: "sha256-aaa",
            extension: entry.extension.manifest,
          };
    },

    doctor: async (): Promise<DoctorReport> => ({ findings: [] }),

    policy: async (): Promise<TrustPolicy> => ({
      exec: {
        setup: "ask",
        hooks: "ask",
        mcp: "ask",
        skillScripts: "ask",
        nonInteractive: "deny",
      },
      sources: { allow: ["*"], deny: [] },
    }),

    auditLog: async () => [...audit],

    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    readLock: async () => ({
      version: 1,
      extensions: {},
    }),
  };
  return store;
};
