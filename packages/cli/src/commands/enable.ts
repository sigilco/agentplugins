import type { CliDeps } from "../deps.js";
import {
  assertNoUnknownFlags,
  flagBool,
  requirePositional,
  type ParsedArgs,
} from "../args.js";
import { emit } from "../output.js";

const KNOWN = ["json"] as const;

const setEnabled = async (
  deps: CliDeps,
  args: ParsedArgs,
  enabled: boolean,
): Promise<void> => {
  assertNoUnknownFlags(args.flags, KNOWN);
  const name = requirePositional(args, 0, "name");
  const json = flagBool(args.flags, "json");

  const extension = await deps.store.setEnabled(name, enabled);
  emit(
    deps.w,
    { extension },
    () => `${enabled ? "enabled" : "disabled"} ${extension.id}`,
    json,
  );
};

export const cmdEnable = (deps: CliDeps, args: ParsedArgs): Promise<void> =>
  setEnabled(deps, args, true);

export const cmdDisable = (deps: CliDeps, args: ParsedArgs): Promise<void> =>
  setEnabled(deps, args, false);
