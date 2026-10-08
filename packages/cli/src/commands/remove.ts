import type { CliDeps } from "../deps.js";
import {
  assertNoUnknownFlags,
  flagBool,
  requirePositional,
  type ParsedArgs,
} from "../args.js";
import { confirm } from "../confirm.js";
import { emit } from "../output.js";

const KNOWN = ["y", "yes", "json", "keep-data"] as const;

export const cmdRemove = async (
  deps: CliDeps,
  args: ParsedArgs,
): Promise<void> => {
  assertNoUnknownFlags(args.flags, KNOWN);
  const name = requirePositional(args, 0, "name");
  const yes = flagBool(args.flags, "y", "yes");
  const json = flagBool(args.flags, "json");

  await confirm(deps, `remove extension "${name}"?`, { yes });
  await deps.store.remove(name);

  emit(deps.w, { removed: name }, () => `removed ${name}`, json);
};
