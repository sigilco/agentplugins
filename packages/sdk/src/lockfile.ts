/**
 * `extensions.lock` IO — spec/lockfile.md: UTF-8 JSON, two-space
 * indentation, extension keys sorted lexically, atomic staged writes
 * under `harness/.lock`, unknown fields preserved on rewrite.
 */

import { FsPort } from "./ports.js";
import type { LockEntry, Lockfile } from "./types.js";
import { StoreError } from "./errors.js";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export const LOCKFILE_VERSION = 1;

export const emptyLockfile = (): Lockfile => ({ version: 1, extensions: {} });

export interface LockfileRead {
  lockfile: Lockfile;
  /** Set when the on-disk file was missing/invalid — call sites audit it. */
  corrupt?: { reason: string; raw?: string };
}

const isLockEntry = (v: unknown): v is LockEntry =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as LockEntry)["kind"] === "string" &&
  typeof (v as LockEntry)["integrity"] === "string" &&
  typeof (v as LockEntry)["manifest"] === "object" &&
  typeof (v as LockEntry)["source"] === "object" &&
  typeof (v as LockEntry)["installedAt"] === "string" &&
  typeof (v as LockEntry)["updatedAt"] === "string" &&
  Array.isArray((v as LockEntry)["targets"]);

/**
 * Read + lightly validate `extensions.lock`. A missing file reads as an
 * empty lockfile; an unparseable or schema-broken one reads as empty AND
 * reports `corrupt` (the writer preserves the file before overwriting —
 * lockfile.md §2.4). `version > 1` throws — readers refuse it (§6).
 */
export const readLockfileText = (text: string): LockfileRead => {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    return {
      lockfile: emptyLockfile(),
      corrupt: { reason: `invalid JSON: ${(e as Error).message}`, raw: text },
    };
  }
  if (typeof doc !== "object" || doc === null || Array.isArray(doc))
    return {
      lockfile: emptyLockfile(),
      corrupt: { reason: "lockfile is not a JSON object", raw: text },
    };
  const rec = doc as Record<string, unknown>;
  if (typeof rec["version"] === "number" && rec["version"] > LOCKFILE_VERSION)
    throw new StoreError(
      "invalid",
      `extensions.lock version ${rec["version"]} > supported ${LOCKFILE_VERSION}`,
      { version: rec["version"] },
    );
  if (typeof rec["extensions"] !== "object" || rec["extensions"] === null)
    return {
      lockfile: emptyLockfile(),
      corrupt: { reason: "lockfile lacks an extensions object", raw: text },
    };
  const extensions: Record<string, LockEntry> = {};
  for (const [name, entry] of Object.entries(rec["extensions"])) {
    if (isLockEntry(entry)) extensions[name] = entry;
  }
  // Unknown top-level fields ride through untouched (§5.5 forward-compat).
  const { version: _v, extensions: _e, ...rest } = rec;
  return {
    lockfile: { ...rest, version: 1, extensions },
  };
};

/** Serialize: sorted extension keys, two-space indent (§2.2). */
export const serializeLockfile = (lockfile: Lockfile): string => {
  const sorted: Record<string, LockEntry> = {};
  for (const name of Object.keys(lockfile.extensions).sort())
    sorted[name] = lockfile.extensions[name];
  const { extensions: _e, ...rest } = lockfile;
  return `${JSON.stringify({ ...rest, version: lockfile.version, extensions: sorted }, null, 2)}\n`;
};

export const readLockfile = async (fs: FsPort, path: string): Promise<LockfileRead> => {
  let text: string;
  try {
    text = decoder.decode(await fs.readFile(path));
  } catch (e) {
    if (e instanceof StoreError) throw e;
    if (
      typeof e === "object" &&
      e !== null &&
      (e as { code?: string }).code === "not-found"
    )
      return { lockfile: emptyLockfile() };
    throw e;
  }
  return readLockfileText(text);
};

export const encodeLockfile = (lockfile: Lockfile): Uint8Array =>
  encoder.encode(serializeLockfile(lockfile));
