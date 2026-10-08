/**
 * Minimal SemVer compare + range satisfaction for `engines.harness`
 * (manifest.md §8.4: npm range syntax against the implementation version).
 * Covers the ranges a manifest realistically declares: `*`, exact,
 * `>`/`>=`/`<`/`<=`/`=` comparators, `^`, `~`, partial `x` wildcards,
 * space-separated AND sets, `||` OR groups. Unsupported syntax fails
 * closed (unsatisfied) rather than silently passing.
 */

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

const VERSION_RE =
  /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export const parseVersion = (raw: string): SemVer | null => {
  const m = raw.trim().match(VERSION_RE);
  if (!m) return null;
  return {
    major: parseInt(m[1], 10),
    minor: m[2] === undefined ? 0 : parseInt(m[2], 10),
    patch: m[3] === undefined ? 0 : parseInt(m[3], 10),
    prerelease: m[4] ? m[4].split(".") : [],
  };
};

/** Numeric identifier comparison; prerelease < release; per semver.org §11. */
export const compareVersions = (a: SemVer, b: SemVer): number => {
  for (const key of ["major", "minor", "patch"] as const) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  const ap = a.prerelease;
  const bp = b.prerelease;
  if (ap.length === 0 && bp.length === 0) return 0;
  if (ap.length === 0) return 1;
  if (bp.length === 0) return -1;
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const x = ap[i];
    const y = bp[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) {
      const diff = parseInt(x, 10) - parseInt(y, 10);
      if (diff !== 0) return diff < 0 ? -1 : 1;
    } else if (xn !== yn) {
      return xn ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
};

interface Comparator {
  op: ">=" | "<=" | ">" | "<" | "=";
  version: SemVer;
}

const PARTIAL_RE = /^v?(\d+|x|\*)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?$/i;

const parseComparator = (raw: string): Comparator | null => {
  const m = raw.match(/^(>=|<=|>|<|=)?\s*(.+)$/);
  if (!m) return null;
  const op = (m[1] ?? "=") as Comparator["op"];
  const v = parseVersion(m[2]);
  if (!v) return null;
  return { op, version: v };
};

/** Expand `^` / `~` / partials into comparator sets. */
const expandTerm = (term: string): Comparator[] | null => {
  if (term === "*" || term === "x" || term === "") return [];
  const caret = term.match(/^\^(.+)$/);
  if (caret) {
    const v = parseVersion(caret[1]);
    if (!v) return null;
    const upper: SemVer =
      v.major > 0
        ? { major: v.major + 1, minor: 0, patch: 0, prerelease: [] }
        : v.minor > 0
          ? { major: 0, minor: v.minor + 1, patch: 0, prerelease: [] }
          : { major: 0, minor: 0, patch: v.patch + 1, prerelease: [] };
    return [
      { op: ">=", version: v },
      { op: "<", version: upper },
    ];
  }
  const tilde = term.match(/^~(.+)$/);
  if (tilde) {
    const partial = tilde[1].match(PARTIAL_RE);
    const v = parseVersion(tilde[1]);
    if (!v || !partial) return null;
    const upper: SemVer = partial[2] === undefined
      ? { major: v.major + 1, minor: 0, patch: 0, prerelease: [] }
      : { major: v.major, minor: v.minor + 1, patch: 0, prerelease: [] };
    return [
      { op: ">=", version: v },
      { op: "<", version: upper },
    ];
  }
  const hyphen = term.match(/^(.+?)\s+-\s+(.+)$/);
  if (hyphen) {
    const lo = parseVersion(hyphen[1]);
    const hi = parseVersion(hyphen[2]);
    if (!lo || !hi) return null;
    return [
      { op: ">=", version: lo },
      { op: "<=", version: hi },
    ];
  }
  const partial = term.match(PARTIAL_RE);
  if (partial && (partial[2] === undefined || /x|\*/i.test(term))) {
    const nums = [partial[1], partial[2], partial[3]].map((p) =>
      p === undefined || /x|\*/i.test(p) ? undefined : parseInt(p, 10),
    );
    if (nums[0] === undefined) return [];
    const lo: SemVer = {
      major: nums[0],
      minor: nums[1] ?? 0,
      patch: nums[2] ?? 0,
      prerelease: [],
    };
    const hi: SemVer = nums[1] === undefined
      ? { major: lo.major + 1, minor: 0, patch: 0, prerelease: [] }
      : nums[2] === undefined
        ? { major: lo.major, minor: lo.minor + 1, patch: 0, prerelease: [] }
        : lo;
    const out: Comparator[] = [{ op: ">=", version: lo }];
    if (nums[2] === undefined) out.push({ op: "<", version: hi });
    else out[0] = { op: "=", version: lo };
    return out;
  }
  const cmp = parseComparator(term);
  return cmp ? [cmp] : null;
};

const satisfiesSet = (v: SemVer, comparators: Comparator[]): boolean =>
  comparators.every((c) => {
    const diff = compareVersions(v, c.version);
    switch (c.op) {
      case ">=": return diff >= 0;
      case "<=": return diff <= 0;
      case ">": return diff > 0;
      case "<": return diff < 0;
      case "=": return diff === 0;
    }
  });

/** `satisfies("0.2.0", ">=0.1.0 <1.0.0")` — npm range semantics subset. */
export const satisfiesRange = (version: string, range: string): boolean => {
  const v = parseVersion(version);
  if (!v) return false;
  const groups = range.split("||").map((g) => g.trim());
  for (const group of groups) {
    // Hyphen ranges contain whitespace — expand before the term split.
    const hyphen = group.match(/^(.+?)\s+-\s+(.+)$/);
    const terms = hyphen
      ? [hyphen[0]!]
      : group.split(/\s+/).filter((t) => t !== "");
    const comparators: Comparator[] = [];
    let ok = true;
    for (const term of terms) {
      const expanded = expandTerm(term);
      if (expanded === null) {
        ok = false;
        break;
      }
      comparators.push(...expanded);
    }
    if (ok && satisfiesSet(v, comparators)) return true;
  }
  return false;
};
