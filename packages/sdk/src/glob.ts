/**
 * URI glob matching for `sources.allow` / `sources.deny` (trust.md §4.1).
 * `*` matches within a path segment, `**` crosses segments, `?` is a
 * single non-separator char. Everything else is literal.
 */

const escapeRe = (s: string): string => s.replace(/[.+^${}()|[\]\\]/g, "\\$&");

export const globToRegExp = (glob: string): RegExp => {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
      } else {
        re += "[^/]*";
      }
    } else if (ch === "?") {
      re += "[^/]";
    } else {
      re += escapeRe(ch);
    }
  }
  return new RegExp(`^${re}$`);
};

export const matchesGlob = (glob: string, value: string): boolean =>
  globToRegExp(glob).test(value);

export const matchesAnyGlob = (globs: string[], value: string): boolean =>
  globs.some((g) => matchesGlob(g, value));
