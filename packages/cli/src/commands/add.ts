/**
 * `harness add <source>` — install an extension.
 *
 * Source resolution and the install itself are sdk operations; the cli
 * owns the flag surface and the trust discipline around them:
 *   - `--skill-target shared|store` picks the skill materialization root
 *     (shared `~/.agents/skills/` is the spec default — store-layout §5.1)
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

const KNOWN = ["skill-target", "y", "yes", "json"] as const;

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

  const extension = await deps.store.install(source, {
    skillTarget,
    actor: deps.actor,
  });

  emit(
    deps.w,
    { installed: extension },
    () =>
      table([
        ["installed", extension.id],
        ["kind", extension.kind],
        [
          "provides",
          extension.provides?.length ? extension.provides.join(",") : "-",
        ],
      ]),
    json,
  );
};
