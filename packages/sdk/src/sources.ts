/**
 * Source parsing — `resolveSource(input)` produces the lockfile's Source
 * object (lockfile.md §3.3) before ref resolution.
 *
 * Accepted spellings:
 *   git     → `git:<url>`, `git@host:path/repo.git`, `ssh://…`, `git://…`,
 *             any `https://…` clone URL outside github.com
 *   github  → `github:owner/repo`, `gh:owner/repo`, bare `owner/repo`,
 *             `https://github.com/owner/repo[.git]`,
 *             `…/tree/<ref>/<path?>`, `git@github.com:owner/repo.git`
 *   local   → `local:<path>`, `file://<path>`, `./`, `../`, `/abs`, `~/`
 *   registry→ `registry:<coords>` or a bare `name` / `name@version`
 *             (no `/`) — index-resolved coordinates per the registry note
 *
 * Refs and monorepo subpaths ride the source string: a `#<ref>` fragment
 * sets the requested ref; `owner/repo/<sub>/<dir>` sets `path`.
 */

import type { SourceRef } from "./types.js";
import { StoreError } from "./errors.js";

const GITHUB_HOST_RE = /^(?:www\.)?github\.com$/i;

const splitRef = (input: string): { base: string; ref?: string } => {
  const hash = input.indexOf("#");
  if (hash < 0) return { base: input };
  return { base: input.slice(0, hash), ref: input.slice(hash + 1) || undefined };
};

const githubRef = (owner: string, repo: string, path?: string, ref?: string): SourceRef => ({
  type: "github",
  uri: `${owner}/${repo}`,
  ref,
  path,
});

const parseGithubUrl = (url: URL): SourceRef | null => {
  const segments = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/").filter(Boolean);
  if (segments.length < 2) return null;
  const [owner, repo, ...rest] = segments;
  let ref: string | undefined;
  let path: string | undefined;
  if (rest.length > 0 && rest[0] === "tree") {
    ref = rest[1];
    if (rest.length > 2) path = rest.slice(2).join("/");
  } else if (rest.length > 0) {
    // e.g. /owner/repo/sub/dir (degit convention)
    path = rest.join("/");
  }
  return githubRef(owner, repo, path, ref);
};

const parseGithubShorthand = (base: string, ref?: string): SourceRef | null => {
  const segments = base.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  const [owner, repo, ...rest] = segments;
  return githubRef(owner, repo, rest.length > 0 ? rest.join("/") : undefined, ref);
};

/**
 * Parse a source string into a `SourceRef`. Throws `StoreError("invalid")`
 * on unparseable input — the bridge maps it to `-32602`.
 */
export const resolveSource = (input: string): SourceRef => {
  const trimmed = input.trim();
  if (trimmed === "") throw new StoreError("invalid", "empty source string");

  const { base, ref } = splitRef(trimmed);

  // Explicit schemes first.
  const scheme = base.match(/^([a-z][a-z0-9-]*):(.*)$/i);
  if (scheme && !/^[a-zA-Z]:[\\/]/.test(base)) {
    const [, kind, rest] = scheme;
    switch (kind.toLowerCase()) {
      case "git":
        return { type: "git", uri: rest, ref };
      case "github":
      case "gh": {
        const gh = parseGithubShorthand(rest, ref);
        if (gh) return gh;
        return { type: "github", uri: rest, ref };
      }
      case "local":
        return { type: "local", uri: rest };
      case "file":
        return { type: "local", uri: rest.replace(/^\/\//, "") };
      case "registry":
        return { type: "registry", uri: rest, ref };
      case "https":
      case "http":
      case "ssh":
      case "git+ssh":
      case "git+https":
        break; // handled by URL parsing below
      default:
        throw new StoreError("invalid", `unknown source scheme: ${kind}`);
    }
  }

  // URLs.
  try {
    const url = new URL(base);
    if (url.protocol === "file:") return { type: "local", uri: url.pathname };
    if (GITHUB_HOST_RE.test(url.hostname)) {
      const gh = parseGithubUrl(url);
      if (gh) {
        if (gh.ref === undefined) gh.ref = ref;
        return gh;
      }
    }
    return { type: "git", uri: base, ref };
  } catch {
    /* not a URL — fall through */
  }

  // SCP-style SSH (git@host:path/repo.git).
  const scp = base.match(/^[^/@\s]+@([^:/\s]+):(.+)$/);
  if (scp) {
    if (GITHUB_HOST_RE.test(scp[1])) {
      const gh = parseGithubShorthand(scp[2].replace(/\.git$/, ""), ref);
      if (gh) return gh;
    }
    return { type: "git", uri: base, ref };
  }

  // Explicitly-local spellings.
  if (
    base.startsWith("./") ||
    base.startsWith("../") ||
    base.startsWith("/") ||
    base.startsWith("~/") ||
    base === "." ||
    base === ".."
  )
    return { type: "local", uri: base };

  // owner/repo[/sub/dir] shorthand → github.
  if (base.includes("/")) {
    const gh = parseGithubShorthand(base, ref);
    if (gh) return gh;
  }

  // Bare coordinates → registry (`name` or `name@version`).
  const coords = base.match(/^([a-zA-Z0-9._-]+?)(?:@(.+))?$/);
  if (coords) {
    const [, name, version] = coords;
    return { type: "registry", uri: name, ref: ref ?? version };
  }

  throw new StoreError("invalid", `unparseable source: ${input}`);
};

/** The git clone URL a SourceRef resolves to (github → https clone). */
export const cloneUrlFor = (source: SourceRef): string =>
  source.type === "github"
    ? `https://github.com/${source.uri}.git`
    : source.uri;
