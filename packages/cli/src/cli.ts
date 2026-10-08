#!/usr/bin/env node
/**
 * `harness` — the AnyHarness CLI. Flag-driven only (scriptc island): every
 * confirm takes `-y`, all output supports `--json`, git ops shell out to
 * the `git` binary, logging is a console shim on stderr.
 */
import process from "node:process";
import readline from "node:readline";

import { parseArgs, type ParsedArgs } from "./args.js";
import { cmdAdd } from "./commands/add.js";
import { cmdAudit } from "./commands/audit.js";
import { cmdDoctor } from "./commands/doctor.js";
import { cmdDisable, cmdEnable } from "./commands/enable.js";
import { cmdList } from "./commands/list.js";
import { cmdRemove } from "./commands/remove.js";
import { cmdServe } from "./commands/serve.js";
import { cmdVerify } from "./commands/verify.js";
import { detectActor, type CliDeps } from "./deps.js";
import { CliError, toCliError } from "./errors.js";
import { flagBool, flagString } from "./args.js";
import { createLogger, emitError, stdoutWriters } from "./output.js";
import { createNodePorts } from "./ports/index.js";
import { resolveStoreRoot } from "./root.js";
import { sdkApi } from "./sdk-bind.js";
import type { ApproveExec } from "./api.js";

const USAGE = `harness — AnyHarness package manager + bridge server

usage:
  harness add <source> [--skill-target shared|store] [--update] [-y] [--json]
  harness remove <name> [-y] [--json]
  harness list [--all] [--kinds skill,mcp] [--json]
  harness enable <name> [--json]
  harness disable <name> [--json]
  harness verify <name> [--json]
  harness doctor [--json]
  harness audit [--json] [--limit N] [--event E] [--actor A] [--extension X]
  harness serve [--transport stdio]

global flags:
  --root <dir>   agents root (default: $ANYHARNESS_STORE,
                 $ANYHARNESS_HOME, or ~/.agents)
  --json         machine-readable output on stdout
  -h, --help     this text
  --version      print version

env:
  ANYHARNESS_STORE   explicit store root (highest precedence)
  ANYHARNESS_HOME    relocate the ~/.agents root
  ANYHARNESS_LOG     debug | info | warn | error (default: info)
  ANYHARNESS_ACTOR   user | agent | daemon (audit attribution override)
`;

const ttyConfirm = (w: (s: string) => void): ((q: string) => Promise<boolean>) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return (question) =>
    new Promise((resolve) => {
      rl.question(`${question} [y/N] `, (answer) => {
        w("");
        resolve(answer.trim().toLowerCase() === "y");
      });
    });
};

const stdinLines = async function* (): AsyncIterable<string> {
  const rl = readline.createInterface({ input: process.stdin });
  for await (const line of rl) yield line;
};

const dispatch = async (
  command: string,
  deps: CliDeps,
  args: ParsedArgs,
): Promise<void> => {
  switch (command) {
    case "add":
      return cmdAdd(deps, args);
    case "remove":
      return cmdRemove(deps, args);
    case "list":
      return cmdList(deps, args);
    case "enable":
      return cmdEnable(deps, args);
    case "disable":
      return cmdDisable(deps, args);
    case "verify":
      return cmdVerify(deps, args);
    case "doctor":
      return cmdDoctor(deps, args);
    case "audit":
      return cmdAudit(deps, args);
    case "serve":
      return cmdServe(deps, args, stdinLines(), (line) => {
        process.stdout.write(`${line}\n`);
      });
    default:
      throw new CliError("usage", `unknown command "${command}"`);
  }
};

const main = async (): Promise<void> => {
  const w = stdoutWriters(process);
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (flagBool(args.flags, "h", "help") || argv.length === 0) {
    w.out(USAGE);
    return;
  }
  if (flagBool(args.flags, "version")) {
    w.out("harness 0.0.0 (anyharness v2)");
    return;
  }

  const command = args.positionals[0];
  if (command === undefined) {
    w.out(USAGE);
    return;
  }
  // The command name is positional[0]; remaining positionals shift down.
  const cmdArgs: ParsedArgs = {
    positionals: args.positionals.slice(1),
    flags: args.flags,
  };

  const json = flagBool(args.flags, "json");
  const interactive = process.stdin.isTTY === true;
  const logLevel = (
    ["debug", "info", "warn", "error"] as const
  ).find((l) => l === process.env.ANYHARNESS_LOG) ?? "info";

  try {
    const ports = createNodePorts();
    const storeRoot = resolveStoreRoot(
      process.env,
      process.env.HOME ?? "",
      flagString(args.flags, "root"),
    );
    const actor =
      command === "serve"
        ? ("daemon" as const)
        : detectActor(process.env, interactive);
    const deps: CliDeps = {
      store: sdkApi.createStore(storeRoot, ports, {
        actor,
        approveExec: interactive
          ? async (req: Parameters<ApproveExec>[0]) => {
              const ask = ttyConfirm((s) => w.err(s));
              return ask(
                `allow ${req.execClass} exec from ${req.extension.name}@${req.extension.version}: ${req.command} ${req.args.join(" ")} (${req.reason})?`,
              );
            }
          : undefined,
      }),
      resolveSource: sdkApi.resolveSource,
      handleBridgeRequest: sdkApi.handleBridgeRequest,
      fs: ports.fs,
      w,
      log: createLogger(w, logLevel),
      env: process.env,
      storeRoot,
      interactive,
      actor,
      confirm: interactive ? ttyConfirm((s) => w.err(s)) : undefined,
      setExitCode: (code) => {
        process.exitCode = code;
      },
    };
    await dispatch(command, deps, cmdArgs);
  } catch (err) {
    const cliErr = toCliError(err);
    emitError(w, cliErr, json);
    process.exitCode = cliErr.exitCode;
  }
};

await main();
