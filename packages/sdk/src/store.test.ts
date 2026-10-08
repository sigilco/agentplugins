import { describe, expect, it } from "vitest";
import { createStore } from "./store.js";
import { createTestPorts } from "./testing.js";
import type { StorePorts } from "./ports.js";

const ROOT = "/agents";

const makePluginTree = (fs: ReturnType<typeof createTestPorts>["fs"], dir: string, over?: { name?: string; skill?: boolean; hooks?: boolean; mcp?: boolean; commands?: string[] }) => {
  const name = over?.name ?? "demo-plugin";
  fs.putFile(
    `${dir}/plugin.json`,
    JSON.stringify({
      $schema: "https://agents.json/plugin.schema.json",
      name,
      version: "1.0.0",
      extensions: { "dev.anyharness": { namespaceVersion: 1, capabilities: ["storage.fs"] } },
    }),
  );
  if (over?.mcp !== false)
    fs.putFile(`${dir}/mcp.json`, JSON.stringify({ mcpServers: { weather: { command: "w-srv" } } }));
  if (over?.hooks)
    fs.putFile(`${dir}/dev.anyharness/hooks.json`, JSON.stringify({ hooks: { "tool.before": [{ command: "./hook.sh" }] } }));
  for (const c of over?.commands ?? [])
    fs.putFile(`${dir}/dev.anyharness/commands/${c}.md`, `---\ndescription: run ${c}\n---\nDo ${c} now.`);
  fs.putFile(`${dir}/dev.anyharness/rules/r.md`, "Be nice.");
};

const makeSkillTree = (fs: ReturnType<typeof createTestPorts>["fs"], dir: string, name = "my-skill") => {
  fs.putFile(`${dir}/SKILL.md`, `---\nname: ${name}\ndescription: test skill\n---\nBody of ${name}.`);
};

const storeAt = (ports: StorePorts) => createStore(ROOT, ports);

describe("createStore — local source installs", () => {
  it("installs a plugin into packages/ + writes lockfile entry", async () => {
    const ports = createTestPorts();
    makePluginTree(ports.fs, "/src/demo");
    const store = storeAt(ports);
    const res = await store.install("/src/demo", { actor: "user" });
    expect(res.extension.id).toBe("demo-plugin@1.0.0");
    expect(res.location).toBe(`${ROOT}/harness/packages/demo-plugin`);

    const lock = await store.readLock();
    const entry = lock.extensions["demo-plugin"];
    expect(entry).toBeTruthy();
    expect(entry.integrity).toMatch(/^sha256-/);
    expect(entry.targets).toContain("mcp");

    // MCP merge into shared ~/.agents/mcp.json.
    const mcp = JSON.parse(new TextDecoder().decode(await ports.fs.readFile(`${ROOT}/mcp.json`)));
    expect(mcp.mcpServers.weather.command).toBe("w-srv");

    // audit.log got an install event.
    const audit = await store.auditLog();
    expect(audit.some((r) => r.event === "install")).toBe(true);
  });

  it("list/get/remove round-trip; setEnabled toggles persisted flag", async () => {
    const ports = createTestPorts();
    makePluginTree(ports.fs, "/src/demo");
    const store = storeAt(ports);
    await store.install("/src/demo");

    expect((await store.list()).map((e) => e.id)).toEqual(["demo-plugin@1.0.0"]);
    expect((await store.get("demo-plugin")).entry.manifest.name).toBe("demo-plugin");
    expect((await store.get("demo-plugin@1.0.0")).extension.manifest.name).toBe("demo-plugin");

    await store.setEnabled("demo-plugin", false);
    expect((await store.get("demo-plugin")).extension.enabled).toBe(false);
    expect((await store.list({ enabledOnly: true }))).toEqual([]);
    await store.setEnabled("demo-plugin", true);

    await store.remove("demo-plugin");
    expect(await store.list()).toEqual([]);
    expect((await ports.fs.stat(`${ROOT}/harness/packages/demo-plugin`))).toBeNull();
    expect((await store.auditLog()).some((r) => r.event === "remove")).toBe(true);
  });

  it("reinstall requires update flag", async () => {
    const ports = createTestPorts();
    makePluginTree(ports.fs, "/src/demo");
    const store = storeAt(ports);
    await store.install("/src/demo");
    await expect(store.install("/src/demo")).rejects.toMatchObject({ kind: "conflict" });
    const res = await store.install("/src/demo", { update: true });
    expect(res.extension.id).toBe("demo-plugin@1.0.0");
    expect((await store.auditLog()).some((r) => r.event === "update")).toBe(true);
  });

  it("standalone SKILL.md installs as skill into shared skills/ (§5.1 default)", async () => {
    const ports = createTestPorts();
    makeSkillTree(ports.fs, "/src/sk", "cool-skill");
    const store = storeAt(ports);
    const res = await store.install("/src/sk");
    expect(res.extension.kind).toBe("skill");
    expect(res.location).toBe(`${ROOT}/skills/cool-skill`);
    const lock = await store.readLock();
    expect(lock.extensions["cool-skill"].targets).toContain("skills");
  });

  it("verify detects integrity drift; doctor reports lock vs fs", async () => {
    const ports = createTestPorts();
    makePluginTree(ports.fs, "/src/demo");
    const store = storeAt(ports);
    await store.install("/src/demo");
    expect((await store.verify("demo-plugin")).ok).toBe(true);

    ports.fs.putFile(`${ROOT}/harness/packages/demo-plugin/extra.txt`, "tampered");
    const bad = await store.verify("demo-plugin");
    expect(bad.ok).toBe(false);

    const report = await store.doctor();
    expect(report.findings.some((f) => f.extension === "demo-plugin")).toBe(true);
  });

  it("policy denies a denied source", async () => {
    const ports = createTestPorts();
    makePluginTree(ports.fs, "/src/demo");
    ports.fs.putFile(
      `${ROOT}/harness/config.toml`,
      `[policy.sources]\ndeny = ["**"]\n`,
    );
    const store = storeAt(ports);
    await expect(store.install("/src/demo")).rejects.toMatchObject({ kind: "policy-denied" });
  });

  it("corrupt lockfile is preserved aside + audited", async () => {
    const ports = createTestPorts();
    ports.fs.putFile(`${ROOT}/harness/extensions.lock`, "{broken");
    const store = storeAt(ports);
    const lock = await store.readLock();
    expect(lock.extensions).toEqual({});
    const audit = await store.auditLog();
    expect(audit.some((r) => r.event === "lockfile.corrupt")).toBe(true);
  });

  it("materialize: plugin skills land in shared skills/, store-target updates targets", async () => {
    const ports = createTestPorts();
    ports.fs.putFile(
      "/src/plug/plugin.json",
      JSON.stringify({ $schema: "x", name: "plug", version: "1.0.0", extensions: { "dev.anyharness": { namespaceVersion: 1 } } }),
    );
    ports.fs.putFile("/src/plug/skills/helper/SKILL.md", "---\nname: helper\n---\nDo it.");
    const store = storeAt(ports);
    await store.install("/src/plug");
    const res = await store.materialize("plug", { include: ["helper"] });
    expect(res.skills[0].materializedTo).toBe(`${ROOT}/skills/helper`);
    expect((await ports.fs.stat(`${ROOT}/skills/helper/SKILL.md`))?.type).toBe("file");
    const lock = await store.readLock();
    expect(lock.extensions["plug"].targets).toContain("skills");
  });
});
