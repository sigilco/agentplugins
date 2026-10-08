/**
 * `harness serve [--transport stdio]` — run the bridge server.
 *
 * v0.1 ships the stdio transport only (the primary one — transports.md §1);
 * `--transport` accepts `stdio` and rejects anything else with a usage
 * error rather than silently ignoring it. Config (`[policy]` +
 * `[[serve.caller]]`) is loaded from `<storeRoot>/config.toml`.
 */
import type { CliDeps } from "../deps.js";
import { assertNoUnknownFlags, flagEnum, type ParsedArgs } from "../args.js";
import {
  callersFromToml,
  defaultPolicy,
  parseToml,
  policyFromToml,
} from "../config.js";
import { CliError } from "../errors.js";
import { serveStdio } from "../serve/stdio.js";
import { STDIO_CALLER } from "../serve/authz.js";

const KNOWN = ["transport", "json"] as const;

export const cmdServe = async (
  deps: CliDeps,
  args: ParsedArgs,
  lines: AsyncIterable<string>,
  write: (line: string) => void,
): Promise<void> => {
  assertNoUnknownFlags(args.flags, KNOWN);
  const transport = flagEnum(args.flags, "transport", ["stdio"] as const);
  if (transport !== undefined && transport !== "stdio") {
    throw new CliError("usage", `unsupported transport "${transport}"`);
  }

  // config.toml lives inside the store's `harness/` dir (store-layout §3).
  const configPath = `${deps.storeRoot}/harness/config.toml`;
  let policy = defaultPolicy();
  let callers: ReturnType<typeof callersFromToml> = [];
  if ((await deps.fs.stat(configPath)) !== null) {
    const root = parseToml(
      new TextDecoder().decode(await deps.fs.readFile(configPath)),
    );
    policy = policyFromToml(root);
    callers = callersFromToml(root);
  }

  deps.log.info(
    `harness serve: stdio transport, caller "${STDIO_CALLER}", store ${deps.storeRoot}`,
  );

  await serveStdio({
    store: deps.store,
    handleRequest: deps.handleBridgeRequest,
    callers,
    callerName: STDIO_CALLER,
    policy,
    log: deps.log,
    lines,
    write,
  });
};
