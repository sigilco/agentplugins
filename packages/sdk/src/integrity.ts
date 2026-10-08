/**
 * Content integrity digests — spec/lockfile.md §4, SRI syntax.
 *
 * The hashed "manifest-of-files" is computed over the installed tree:
 * every regular file's `<sha256-hex-of-contents>  <relative-path>` line,
 * sorted by UTF-8 byte order of the path, joined with `\n`, then SHA-256
 * + base64'd into `sha256-<b64>`. Symlinks hash their *target string*;
 * a dangling or root-escaping symlink aborts the digest.
 */

import { FsPort } from "./ports.js";
import { sha256, toBase64, toHex } from "./hash.js";
import { compareUtf8, dirname, isInside, join, normalize } from "./path.js";
import { StoreError, trustViolation } from "./errors.js";

const encoder = new TextEncoder();

export interface PackageFile {
  /** `/`-separated path relative to the package root. */
  path: string;
  size: number;
}

/**
 * Recursively enumerate regular files + symlinks under `root`.
 * Paths are relative, `/`-separated, sorted by UTF-8 byte order.
 */
export const listPackageFiles = async (
  fs: FsPort,
  root: string,
): Promise<PackageFile[]> => {
  const files: PackageFile[] = [];
  const walk = async (dir: string, rel: string): Promise<void> => {
    let entries;
    try {
      entries = await fs.readDir(dir);
    } catch {
      return; // absent dirs contribute nothing
    }
    for (const entry of entries) {
      const childAbs = join(dir, entry.name);
      const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.type === "directory") {
        await walk(childAbs, childRel);
      } else if (entry.type === "file" || entry.type === "symlink") {
        const st = await fs.stat(childAbs);
        files.push({ path: childRel, size: st?.size ?? 0 });
      }
      // "other" entries (fifos, sockets) are not regular files — skipped.
    }
  };
  await walk(root, "");
  files.sort((a, b) => compareUtf8(a.path, b.path));
  return files;
};

/**
 * Read the byte content a file contributes to the digest: file bytes, or
 * for a symlink the *target string*'s bytes — but only when the target
 * resolves to an existing entry still inside `pkgRoot` (containment,
 * store-layout.md §6.3 + lockfile.md §4).
 */
const contentForDigest = async (
  fs: FsPort,
  pkgRoot: string,
  abs: string,
  type: "file" | "symlink",
): Promise<Uint8Array> => {
  if (type === "file") return fs.readFile(abs);
  const target = await fs.readlink(abs);
  const resolved = normalize(
    target.startsWith("/") ? target : join(dirname(abs), target),
  );
  if (!isInside(pkgRoot, resolved))
    throw trustViolation(
      undefined,
      abs,
      `symlink escapes package root: ${abs} -> ${target}`,
    );
  const st = await fs.stat(resolved);
  if (st === null)
    throw trustViolation(
      undefined,
      abs,
      `dangling symlink: ${abs} -> ${target}`,
    );
  return encoder.encode(target);
};

/**
 * SRI digest over the package tree at `pkgRoot`. Throws `trust-violation`
 * when a symlink dangles or escapes the package root.
 */
export const computeIntegrity = async (
  fs: FsPort,
  pkgRoot: string,
): Promise<string> => {
  const files = await listPackageFiles(fs, pkgRoot);
  const lines: string[] = [];
  for (const file of files) {
    const abs = join(pkgRoot, file.path);
    const st = await fs.stat(abs);
    if (st === null) throw new StoreError("internal", `vanished during digest: ${abs}`);
    const type = st.type === "symlink" ? "symlink" : "file";
    const contents = await contentForDigest(fs, pkgRoot, abs, type);
    lines.push(`${toHex(sha256(contents))}  ${file.path}`);
  }
  const manifestBytes = encoder.encode(lines.join("\n"));
  return `sha256-${toBase64(sha256(manifestBytes))}`;
};
