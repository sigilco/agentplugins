import {
  inProcessBridge,
  type BridgeClient,
  type BridgeHandlers,
  type Extension,
} from "@any-harness/metaharness";

/**
 * Demo bridge host: an in-process binding over a canned extension set.
 * Stands in for a real store host (`harness serve` over stdio) until W2/W3
 * land the spec and the sdk implementation.
 */
const DEMO_EXTENSIONS: Extension[] = [
  {
    name: "commit-smith",
    kind: "skill",
    ref: { manifest: "~/.agents/skills/commit-smith/SKILL.md" },
    description: "Draft conventional-commit messages from a staged diff.",
  },
  {
    name: "echo-mcp",
    kind: "mcp",
    ref: { manifest: "~/.agents/harness/echo-mcp/plugin.json", version: "0.1.0" },
    description: "Demo MCP server exposing a single `echo` tool.",
  },
  {
    name: "review",
    kind: "command",
    ref: { manifest: "~/.agents/harness/review/plugin.json", version: "0.1.0" },
    description: "Demo command: review the current diff.",
  },
];

const COMMIT_SMITH_SKILL = `---
name: commit-smith
description: Draft conventional-commit messages from a staged diff.
---
# commit-smith
Read the staged diff, then propose a single conventional commit message
(type(scope): summary) plus an optional body listing breaking changes.
`;

const handlers: BridgeHandlers = {
  "capabilities.negotiate": (params) => {
    const requested = params?.capabilities ?? [];
    // The demo host grants every declared slot — a real host denies the ones
    // it can't serve (e.g. exec on browser targets).
    return {
      protocolVersion: params?.protocolVersion ?? "0.1",
      granted: requested,
      denied: [],
    };
  },
  "extensions.list": (params) => ({
    extensions: params?.kind
      ? DEMO_EXTENSIONS.filter((e) => e.kind === params.kind)
      : DEMO_EXTENSIONS,
  }),
  "extensions.get": (params) => ({
    extension: DEMO_EXTENSIONS.find((e) => e.name === params?.name) ?? null,
  }),
  "skills.materialize": (params) =>
    params?.name === "commit-smith"
      ? { found: true, content: COMMIT_SMITH_SKILL }
      : { found: false },
  "commands.resolve": (params) =>
    params?.name === "review"
      ? {
          resolved: true,
          instructions: "Review the current diff for correctness, then summarize findings.",
        }
      : { resolved: false },
  "tools.call": (params) =>
    params?.extension === "echo-mcp" && params?.tool === "echo"
      ? { output: params.input }
      : { error: `unknown tool ${params?.extension}/${params?.tool}` },
  "events.notify": () => ({ ok: true }),
  // hooks.invoke intentionally omitted — the demo host has no hooks.
};

export const demoBridge = (): BridgeClient => inProcessBridge(handlers);
