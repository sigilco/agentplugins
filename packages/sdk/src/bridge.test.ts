import { describe, expect, it } from "vitest";
import { createBridgeSession, handleBridgeRequest, type JsonRpcRequest } from "./bridge.js";
import { createStore, type Store } from "./store.js";
import { createTestPorts } from "./testing.js";

const ROOT = "/agents";

const makeStore = async (): Promise<Store> => {
  const ports = createTestPorts();
  ports.fs.putFile(
    "/src/plug/plugin.json",
    JSON.stringify({
      $schema: "x",
      name: "plug",
      version: "1.0.0",
      extensions: { "dev.anyharness": { namespaceVersion: 1, capabilities: ["storage.fs"] } },
    }),
  );
  ports.fs.putFile("/src/plug/skills/helper/SKILL.md", "---\nname: helper\ndescription: d\n---\nBody.");
  ports.fs.putFile("/src/plug/dev.anyharness/commands/lint.md", "---\ndescription: lint\n---\nLint it.");
  const store = createStore(ROOT, ports);
  await store.install("/src/plug");
  return store;
};

const req = (method: string, params?: Record<string, unknown>, id: string | number = "r1"): JsonRpcRequest => ({
  jsonrpc: "2.0",
  id,
  method,
  params,
});

const negotiate = async (store: Store, session?: ReturnType<typeof createBridgeSession>) =>
  handleBridgeRequest(store, req("capabilities.negotiate", {
    protocol: { supported: ["0.1", "0.9"] },
    client: { name: "test-harness", version: "1.0" },
    capabilities: {
      kinds: ["skill", "command", "hook", "mcp", "plugin"],
      hookEvents: ["tool.before"],
      slots: { storage: "fs", secrets: "host", exec: true, skills: "read-write", mcp: "external" },
    },
  }, "neg"), session);

describe("handleBridgeRequest", () => {
  it("handshake gate: non-negotiate first → -32002", async () => {
    const store = await makeStore();
    const res = await handleBridgeRequest(store, req("extensions.list"));
    expect(res.error?.code).toBe(-32002);
  });

  it("negotiate picks common protocol + returns granted caps; second negotiate → -32602", async () => {
    const store = await makeStore();
    const res = await negotiate(store);
    expect(res.error).toBeUndefined();
    const result = res.result as Record<string, unknown>;
    expect((result["protocol"] as { version: string }).version).toBe("0.1");
    const caps = result["capabilities"] as { slots: Record<string, unknown> };
    expect(caps.slots["storage"]).toBe("fs");
    expect(caps.slots["mcp"]).toBe("external");

    const again = await handleBridgeRequest(store, req("capabilities.negotiate", {
      protocol: { supported: ["0.1"] },
      client: { name: "x", version: "1" },
      capabilities: {},
    }));
    expect(again.error?.code).toBe(-32602);
  });

  it("version-mismatch → -32001 with supported list", async () => {
    const store = await makeStore();
    const res = await handleBridgeRequest(store, req("capabilities.negotiate", {
      protocol: { supported: ["9.9"] },
      client: { name: "x", version: "1" },
      capabilities: {},
    }));
    expect(res.error?.code).toBe(-32001);
    expect(res.error?.data?.["supported"]).toContain("0.1");
  });

  it("extensions.list filters + extensions.get returns document", async () => {
    const store = await makeStore();
    await negotiate(store);
    const list = await handleBridgeRequest(store, req("extensions.list", {}));
    const exts = (list.result as { extensions: { id: string }[] }).extensions;
    expect(exts.map((e) => e.id)).toContain("plug@1.0.0");

    const get = await handleBridgeRequest(store, req("extensions.get", { id: "plug@1.0.0" }));
    const doc = (get.result as { document: Record<string, unknown> }).document;
    expect(doc["name"]).toBe("plug");
    expect(get.error).toBeUndefined();

    const missing = await handleBridgeRequest(store, req("extensions.get", { id: "nope@0.0.0" }));
    expect(missing.error?.code).toBe(-32004);
  });

  it("skills.materialize → store target copies skill to shared root", async () => {
    const store = await makeStore();
    await negotiate(store);
    const res = await handleBridgeRequest(store, req("skills.materialize", { extension: "plug@1.0.0", target: "store" }));
    expect(res.error).toBeUndefined();
    const skills = (res.result as { skills: { name: string; materializedTo?: string }[] }).skills;
    expect(skills.map((s) => s.name)).toContain("helper");
    expect((await store.ports.fs.stat(`${ROOT}/skills/helper/SKILL.md`))?.type).toBe("file");
  });

  it("commands.resolve returns expansion + argv", async () => {
    const store = await makeStore();
    await negotiate(store);
    const res = await handleBridgeRequest(store, req("commands.resolve", { text: "/lint --fix" }));
    expect(res.error).toBeUndefined();
    const r = res.result as { expansion: { prompt: string }; command: { argv: string[] } };
    expect(r.expansion.prompt).toContain("Lint it.");
    expect(r.command.argv).toEqual(["--fix"]);
  });

  it("tools.call without mcp:managed → capability-unsupported", async () => {
    const store = await makeStore();
    await negotiate(store);
    const res = await handleBridgeRequest(store, req("tools.call", { server: "s", tool: "t", arguments: {} }));
    expect(res.error?.code).toBe(-32003);
  });

  it("unknown method → -32601; notifications not answered (placeholder ok)", async () => {
    const store = await makeStore();
    const res = await handleBridgeRequest(store, req("nope.method", {}));
    expect(res.error?.code).toBe(-32601);
    const notif = await handleBridgeRequest(store, { jsonrpc: "2.0", method: "events.notify", params: { kind: "extensions.changed" } });
    expect(notif.result).toBeTruthy();
  });

  it("hooks.invoke runs matching hook entries and merges status", async () => {
    const ports = createTestPorts();
    ports.fs.putFile(
      "/src/hk/plugin.json",
      JSON.stringify({ $schema: "x", name: "hk", version: "1.0.0", extensions: { "dev.anyharness": { namespaceVersion: 1 } } }),
    );
    ports.fs.putFile("/src/hk/dev.anyharness/hooks.json", JSON.stringify({ hooks: { "tool.before": [{ command: "hook-runner" }] } }));
    // Approve hook exec for the daemon actor: nonInteractive=allow.
    ports.fs.putFile(`${ROOT}/harness/config.toml`, `[policy.exec]\nnonInteractive = "allow"\n`);
    ports.exec.handler.set("hook-runner", () => ({ code: 0, stdout: JSON.stringify({ status: "modify", output: { patched: true } }), stderr: "" }));
    const store = createStore(ROOT, ports);
    await store.install("/src/hk");
    const session = createBridgeSession(store);
    await negotiate(store, session);
    const res = await handleBridgeRequest(store, req("hooks.invoke", {
      event: "tool.before",
      input: { tool: "x" },
    }), session);
    expect(res.error).toBeUndefined();
    expect((res.result as { status: string }).status).toBe("modify");
    expect(ports.exec.calls.some((c) => c.cmd === "hook-runner")).toBe(true);
  });
});
