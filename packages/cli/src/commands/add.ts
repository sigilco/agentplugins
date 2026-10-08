/**
 * `harness add <source>` — install an extension.
 *
 * Source resolution and the install itself are sdk operations; the cli
 * owns the flag surface and the trust discipline around them:
 *   - `--skill-target shared|store` picks the skill materialization root
 *     (shared `~/.agents/skills/` is the spec default — store-layout §5.1;
 *     `store` maps to the sdk's `installTarget: "packages"`)
 *   - `--update` allows replacing an existing lock entry (trust.md §3.3)
 *   - `-y` attests the mutating op; without it an interactive TTY gets a
 *     y/N prompt and a non-interactive caller is refused
 *   - the resolved `actor` rides along so the sdk's trust layer can keep
 *     agent-installed executables dormant (trust.md §4.2)
 */
import type { CliDeps } from "../deps.js";
import {
  assertNoUnknownFlags,
  flagBool,
  flagEnum,
  requirePositional,
  type ParsedArgs,
} from "../args.js";
import { confirm } from "../confirm.js";
import { emit, table } from "../output.js";

const KNOWN = ["skill-target", "update", "y", "yes", "json"] as const;

export const cmdAdd = async (deps: CliDeps, args: ParsedArgs): Promise<void> => {
  assertNoUnknownFlags(args.flags, KNOWN);
  const sourceInput = requirePositional(args, 0, "source");
  const skillTarget = flagEnum(args.flags, "skill-target", [
    "shared",
    "store",
  ] as const);
  const yes = flagBool(args.flags, "y", "yes");
  const json = flagBool(args.flags, "json");

  const source = deps.resolveSource(sourceInput);
  await confirm(deps, `install ${source.type} source ${source.uri}?`, { yes });

  const result = await deps.store.install(source, {
    installTarget: skillTarget === "store" ? "packages" : "shared",
    update: flagBool(args.flags, "update") || undefined,
    actor: deps.actor,
  });
  const extension = result.extension;

  emit(
    deps.w,
    { installed: extension, location: result.location, warnings: result.warnings },
    () =>
      table([
        ["installed", extension.id],
        ["kind", extension.kind],
        ["location", result.location],
        [
          "provides",
          extension.provides?.length ? extension.provides.join(",") : "-",
        ],
        ...result.warnings.map((w): [string, string] => ["warning", w]),
      ]),
    json,
  );
};
