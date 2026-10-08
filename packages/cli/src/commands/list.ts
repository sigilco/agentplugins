import type { CliDeps } from "../deps.js";
import type { ExtensionKind } from "../api.js";
import {
  assertNoUnknownFlags,
  flagBool,
  type ParsedArgs,
} from "../args.js";
import { emit, table } from "../output.js";

const KNOWN = ["json", "all", "kinds"] as const;

export const cmdList = async (
  deps: CliDeps,
  args: ParsedArgs,
): Promise<void> => {
  assertNoUnknownFlags(args.flags, KNOWN);
  const json = flagBool(args.flags, "json");
  const all = flagBool(args.flags, "all");
  const kindsRaw = args.flags.kinds;
  const kinds =
    typeof kindsRaw === "string"
      ? (kindsRaw.split(",").map((k) => k.trim()) as ExtensionKind[])
      : undefined;

  const extensions = await deps.store.list({
    kinds,
    enabledOnly: all ? undefined : true,
  });

  emit(
    deps.w,
    { extensions },
    () => {
      if (extensions.length === 0) return "no extensions installed";
      return table([
        ["NAME", "KIND", "VERSION", "ENABLED"],
        ...extensions.map((e) => [
          e.manifest.name,
          e.kind,
          e.manifest.version,
          e.enabled ? "yes" : "no",
        ]),
      ]);
    },
    json,
  );
};
