// Node edge of the playground — the only file allowed `node:*` imports.
// Everything upstream (capabilities, host, run loop) stays isomorphic.
import process from "node:process";
import readline from "node:readline/promises";

import type { ModelMessage } from "ai";

import { createPlaygroundCapabilities } from "./capabilities.js";
import { modelFromEnv } from "./model.js";
import { streamTurn } from "./run.js";

const USAGE = `anyharness playground — metaharness demo CLI

usage:
  tsx src/cli.ts                  # REPL
  tsx src/cli.ts --prompt "..."   # one-shot turn
  tsx src/cli.ts --help

env (BYOK): AI_BASE_URL, AI_API_KEY, AI_MODEL_ID — any OpenAI-compatible
endpoint (OpenAI, Anthropic-compat gateway, LM Studio, mock server).
`;

const promptArg = (argv: string[]): string | undefined => {
  const i = argv.findIndex((a) => a === "--prompt" || a === "-p");
  return i === -1 ? undefined : argv[i + 1];
};

const render = (event: Awaited<ReturnType<typeof streamTurn>> extends AsyncIterable<infer E> ? E : never): void => {
  if (event.kind === "text") {
    process.stdout.write(event.text);
  } else if (event.kind === "tool-call") {
    process.stdout.write(`\n[tool] ${event.tool} ${JSON.stringify(event.input)}\n`);
  } else if (event.kind === "tool-result") {
    const out = JSON.stringify(event.output);
    process.stdout.write(`[result] ${out.length > 400 ? `${out.slice(0, 400)}…` : out}\n`);
  } else if (event.kind === "finish") {
    process.stdout.write("\n");
  }
};

const main = async () => {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(USAGE);
    return;
  }

  const resolved = modelFromEnv(process.env);
  if ("error" in resolved) {
    process.stderr.write(`${resolved.error}\n`);
    process.exitCode = 2;
    return;
  }

  const capabilities = createPlaygroundCapabilities({
    env: process.env,
    storeDir: ".playground-store",
  });
  const history: ModelMessage[] = [];
  const once = promptArg(argv);

  const runTurn = async (prompt: string) => {
    history.push({ role: "user", content: prompt });
    process.stdout.write("agent> ");
    for await (const event of streamTurn({
      model: resolved.model,
      messages: history,
      capabilities,
    })) {
      render(event);
    }
  };

  if (once !== undefined) {
    await runTurn(once);
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  process.stdout.write("anyharness playground — type a message, 'exit' to quit\n");
  for (;;) {
    let line: string;
    try {
      line = await rl.question("you> ");
    } catch {
      break; // stdin closed (EOF / piped input ended)
    }
    const prompt = line.trim();
    if (prompt === "exit" || prompt === "quit") break;
    if (!prompt) continue;
    await runTurn(prompt);
  }
  rl.close();
};

await main();
