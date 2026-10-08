/**
 * POSIX logical-path helpers. Store paths are UTF-8, `/`-separated logical
 * paths (store-layout.md §6.1); node path is unavailable isomorphically.
 */

/** Join path segments with `/`, collapsing redundant separators. */
export const join = (...parts: string[]): string => {
  const raw = parts.filter((p) => p.length > 0).join("/");
  return raw.replace(/\/+/g, "/");
};

/**
 * Normalize a `/`-separated path: resolve `.` and `..` segments
 * lexically (no symlink resolution — that is `resolveInside`'s job).
 * Keeps a leading `/` when present; never emits a trailing `/` (except
 * for the root itself, which returns "/").
 */
export const normalize = (path: string): string => {
  const absolute = path.startsWith("/");
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else if (!absolute) out.push("..");
      // ".." above a filesystem root clamps to root.
      continue;
    }
    out.push(seg);
  }
  const joined = out.join("/");
  return absolute ? `/${joined}` : joined === "" ? "." : joined;
};

/** True when `child` equals or sits under `parent` after normalization. */
export const isInside = (parent: string, child: string): boolean => {
  const p = normalize(parent);
  const c = normalize(child);
  return c === p || c.startsWith(p === "/" ? "/" : `${p}/`);
};

/**
 * Resolve a package-relative reference (`./x/y`, or a bare relative path)
 * inside `root`. Returns the normalized absolute path, or `null` when the
 * reference escapes the root (spec/store-layout.md §6.3 containment).
 */
export const resolveInside = (
  root: string,
  rel: string,
): string | null => {
  if (rel.startsWith("/")) return null; // absolute refs are never inside
  const resolved = normalize(join(root, rel));
  return isInside(root, resolved) ? resolved : null;
};

export const basename = (path: string): string => {
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx < 0 ? trimmed : trimmed.slice(idx + 1);
};

export const dirname = (path: string): string => {
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx < 0) return ".";
  if (idx === 0) return "/";
  return trimmed.slice(0, idx);
};

/** Compare two strings by UTF-8 byte order (lockfile.md §4 file sorting). */
const byteEncoder = new TextEncoder();
export const compareUtf8 = (a: string, b: string): number => {
  const ba = byteEncoder.encode(a);
  const bb = byteEncoder.encode(b);
  const n = Math.min(ba.length, bb.length);
  for (let i = 0; i < n; i++) {
    if (ba[i] !== bb[i]) return ba[i] - bb[i];
  }
  return ba.length - bb.length;
};
