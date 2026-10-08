/**
 * Hand-rolled in-memory Store for tests — implements the pinned Store
 * surface (`api.ts`) without touching `@any-harness/sdk` (stub until W8).
 * Not part of the shipped cli surface beyond tests; exported so sibling
 * workstreams can reuse it for their own cli-side tests.
 */
import type {
  DoctorReport,
  Extension,
  InstallOptions,
  SourceRef,
  Store,
  VerifyResult,
} from "../api.js";

export interface MockStore extends Store {
  /** Test inspection: lock-entry-shaped records keyed by extension name. */
  entries: Map<string, { extension: Extension; tampered: boolean }>;
  /** Test inspection: install calls as received. */
  installs: { source: SourceRef; opts?: InstallOptions }[];
}

const idOf = (name: string, version: string): string => `${name}@${version}`;

export const createMockStore = (
  seed: Extension[] = [],
): MockStore => {
  const entries = new Map<string, { extension: Extension; tampered: boolean }>();
  for (const e of seed) entries.set(e.manifest.name, { extension: e, tampered: false });
  const installs: { source: SourceRef; opts?: InstallOptions }[] = [];

  const find = (name: string) => {
    const entry = entries.get(name);
    if (!entry) throw new Error(`extension not found: ${name}`);
    return entry;
  };

  return {
    entries,
    installs,
    list: async () => [...entries.values()].map((e) => e.extension),
    install: async (source, opts) => {
      installs.push({ source, ...(opts ? { opts } : {}) });
      const name = source.path?.split("/").pop() ?? source.uri.split("/").pop() ?? source.uri;
      const extension: Extension = {
        id: idOf(name, "1.0.0"),
        kind: "plugin",
        manifest: { name, version: "1.0.0" },
        enabled: true,
      };
      entries.set(name, { extension, tampered: false });
      return extension;
    },
    remove: async (name) => {
      find(name);
      entries.delete(name);
    },
    setEnabled: async (name, enabled) => {
      const entry = find(name);
      entry.extension = { ...entry.extension, enabled };
      return entry.extension;
    },
    materialize: async (name) => {
      find(name);
      return { materializedTo: [`~/.agents/skills/${name}`] };
    },
    verify: async (name): Promise<VerifyResult> => {
      const entry = find(name);
      return entry.tampered
        ? { ok: false, expected: "sha256-aaa", actual: "sha256-bbb" }
        : { ok: true, expected: "sha256-aaa", actual: "sha256-aaa" };
    },
    doctor: async (): Promise<DoctorReport> => ({ ok: true, findings: [] }),
  };
};
