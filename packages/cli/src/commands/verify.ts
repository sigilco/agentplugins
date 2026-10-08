import type { CliDeps } from "../deps.js";
import {
  assertNoUnknownFlags,
  flagBool,
  requirePositional,
  type ParsedArgs,
} from "../args.js";
import { CliError } from "../errors.js";
import { emit, table } from "../output.js";

const KNOWN = ["json"] as const;

export const cmdVerify = async (
  deps: CliDeps,
  args: ParsedArgs,
): Promise<void> => {
  assertNoUnknownFlags(args.flags, KNOWN);
  const name = requirePositional(args, 0, "name");
  const json = flagBool(args.flags, "json");

  const result = await deps.store.verify(name);
  emit(
    deps.w,
    { name, ...result },
    () =>
      table([
        ["extension", name],
        ["integrity", result.ok ? "ok" : "MISMATCH"],
        ["expected", result.expected ?? "-"],
        ["actual", result.actual ?? "-"],
      ]),
    json,
  );

  if (!result.ok) {
    // trust.md §3.2 — mismatch means untrusted; remediation is reinstall.
    throw new CliError(
      "trust-violation",
      `integrity mismatch for "${name}": reinstall with \`harness add --reinstall\` (expected ${result.expected ?? "?"}, got ${result.actual ?? "?"})`,
      { details: { expected: result.expected, actual: result.actual } },
    );
  }
};
