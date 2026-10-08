/**
 * Minimal flag parser — hand-rolled per the scriptc-island dependency rules
 * (no cleye/clack-class prompt or arg libs). Supports:
 *
 *   --flag            boolean true
 *   --no-flag         boolean false
 *   --key value       string value
 *   --key=value       string value
 *   -y                boolean shorthand (short flags are never combined)
 *   --                everything after is positional
 */
import { CliError } from "./errors.js";

export interface ParsedArgs {
  /** Non-flag arguments in order. */
  positionals: string[];
  flags: Record<string, string | boolean>;
}

export const parseArgs = (argv: string[]): ParsedArgs => {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let rest = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (rest) {
      positionals.push(arg);
      continue;
    }
    if (arg === "--") {
      rest = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }
      if (body.startsWith("no-") && body.length > 3) {
        flags[body.slice(3)] = false;
        continue;
      }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags[body] = next;
        i += 1;
        continue;
      }
      flags[body] = true;
      continue;
    }
    if (arg.startsWith("-") && arg.length > 1 && arg !== "-") {
      // Short flags: single char booleans (no bundling, no values).
      for (const ch of arg.slice(1)) {
        flags[ch] = true;
      }
      continue;
    }
    positionals.push(arg);
  }
  return { positionals, flags };
};

export const flagBool = (
  flags: ParsedArgs["flags"],
  ...names: string[]
): boolean => names.some((n) => flags[n] === true);

export const flagString = (
  flags: ParsedArgs["flags"],
  ...names: string[]
): string | undefined => {
  for (const n of names) {
    const v = flags[n];
    if (typeof v === "string") return v;
  }
  return undefined;
};

export const flagEnum = <T extends string>(
  flags: ParsedArgs["flags"],
  name: string,
  values: readonly T[],
): T | undefined => {
  const raw = flagString(flags, name);
  if (raw === undefined) return undefined;
  if ((values as readonly string[]).includes(raw)) return raw as T;
  throw new CliError(
    "invalid-params",
    `invalid --${name} value "${raw}" (expected: ${values.join(" | ")})`,
  );
};

/** Reject flags the command doesn't know about (typo safety). */
export const assertNoUnknownFlags = (
  flags: ParsedArgs["flags"],
  known: readonly string[],
): void => {
  const knownSet = new Set(known);
  for (const key of Object.keys(flags)) {
    if (!knownSet.has(key)) {
      throw new CliError("usage", `unknown flag --${key}`);
    }
  }
};

export const requirePositional = (
  args: ParsedArgs,
  index: number,
  what: string,
): string => {
  const value = args.positionals[index];
  if (value === undefined || value === "") {
    throw new CliError("usage", `missing required argument <${what}>`);
  }
  return value;
};
