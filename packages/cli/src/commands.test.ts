import { describe, expect, it } from "vitest";

import { parseArgs } from "./args.js";
import { cmdAdd } from "./commands/add.js";
import { cmdAudit, parseAuditLog } from "./commands/audit.js";
import { cmdDoctor } from "./commands/doctor.js";
import { cmdDisable, cmdEnable } from "./commands/enable.js";
import { cmdList } from "./commands/list.js";
import { cmdRemove } from "./commands/remove.js";
import { cmdVerify } from "./commands/verify.js";
import { CliError } from "./errors.js";
import { createMemoryFs } from "./testing/memory-fs.js";
import { createMockStore } from "./testing/mock-store.js";
import { createTestDeps } from "./testing/deps.js";
import type { Extension } from "./api.js";

const seedExt = (name: string, enabled = true): Extension => ({
  id: `${name}@1.0.0`,
  kind: "plugin",
  manifest: { name, version: "1.0.0" },
  enabled,
  provides: ["skill", "command"],
});

describe("harness add", () => {
  it("installs with -y and --json", async () => {
    const t = createTestDeps();
    await cmdAdd(t.deps, parseArgs(["acme/tools", "-y", "--json"]));
    expect(t.store.installs).toHaveLength(1);
    expect(t.store.installs[0].source).toEqual({
      type: "github",
      uri: "acme/tools",
    });
    const out = JSON.parse(t.out[0]);
    expect(out.installed.id).toBe("tools@1.0.0");
  });

  it("forwards --skill-target and actor to store.install", async () => {
    const t = createTestDeps({ actor: "agent" });
    await cmdAdd(
      t.deps,
      parseArgs(["acme/tools", "-y", "--skill-target", "store"]),
    );
    expect(t.store.installs[0].opts).toEqual({
      skillTarget: "store",
      actor: "agent",
    });
  });

  it("refuses non-interactive without -y", async () => {
    const t = createTestDeps({ interactive: false });
    await expect(
      cmdAdd(t.deps, parseArgs(["acme/tools"])),
    ).rejects.toMatchObject({ kind: "confirmation-required", exitCode: 5 });
    expect(t.store.installs).toHaveLength(0);
  });

  it("prompts on interactive TTY and honors the answer", async () => {
    const yes = createTestDeps({
      interactive: true,
      confirm: async () => true,
    });
    await cmdAdd(yes.deps, parseArgs(["acme/tools"]));
    expect(yes.store.installs).toHaveLength(1);

    const no = createTestDeps({
      interactive: true,
      confirm: async () => false,
    });
    await expect(cmdAdd(no.deps, parseArgs(["acme/tools"]))).rejects.toThrow(
      CliError,
    );
    expect(no.store.installs).toHaveLength(0);
  });
});

describe("harness remove", () => {
  it("removes with -y", async () => {
    const t = createTestDeps({ store: createMockStore([seedExt("tools")]) });
    await cmdRemove(t.deps, parseArgs(["tools", "-y"]));
    expect(t.out[0]).toBe("removed tools");
    expect(await t.deps.store.list()).toHaveLength(0);
  });

  it("requires confirmation", async () => {
    const t = createTestDeps({ store: createMockStore([seedExt("tools")]) });
    await expect(cmdRemove(t.deps, parseArgs(["tools"]))).rejects.toMatchObject(
      { kind: "confirmation-required" },
    );
    expect(await t.deps.store.list()).toHaveLength(1);
  });
});

describe("harness list", () => {
  it("prints a table of enabled extensions by default", async () => {
    const store = createMockStore([
      seedExt("alpha"),
      seedExt("beta", false),
    ]);
    const t = createTestDeps({ store });
    await cmdList(t.deps, parseArgs([]));
    expect(t.out[0]).toContain("alpha");
    expect(t.out[0]).not.toContain("beta");
  });

  it("--all includes disabled; --json emits the extension array", async () => {
    const store = createMockStore([seedExt("beta", false)]);
    const t = createTestDeps({ store });
    await cmdList(t.deps, parseArgs(["--all", "--json"]));
    const out = JSON.parse(t.out[0]);
    expect(out.extensions).toHaveLength(1);
    expect(out.extensions[0].manifest.name).toBe("beta");
  });

  it("--kinds filters by primary kind or provides", async () => {
    const store = createMockStore([
      seedExt("with-skill"),
      { ...seedExt("no-extra"), provides: undefined },
    ]);
    const t = createTestDeps({ store });
    await cmdList(t.deps, parseArgs(["--kinds", "skill", "--json"]));
    const out = JSON.parse(t.out[0]);
    expect(out.extensions.map((e: Extension) => e.manifest.name)).toEqual([
      "with-skill",
    ]);
  });
});

describe("harness enable / disable", () => {
  it("toggles enabled state", async () => {
    const t = createTestDeps({ store: createMockStore([seedExt("tools")]) });
    await cmdDisable(t.deps, parseArgs(["tools"]));
    expect(t.out[0]).toBe("disabled tools@1.0.0");
    await cmdEnable(t.deps, parseArgs(["tools"]));
    expect(t.out[1]).toBe("enabled tools@1.0.0");
  });
});

describe("harness verify", () => {
  it("passes on matching integrity", async () => {
    const t = createTestDeps({ store: createMockStore([seedExt("tools")]) });
    await cmdVerify(t.deps, parseArgs(["tools"]));
    expect(t.out[0]).toContain("ok");
  });

  it("raises trust-violation on mismatch", async () => {
    const store = createMockStore([seedExt("tools")]);
    store.entries.get("tools")!.tampered = true;
    const t = createTestDeps({ store });
    await expect(cmdVerify(t.deps, parseArgs(["tools"]))).rejects.toMatchObject(
      { kind: "trust-violation", exitCode: 4 },
    );
  });
});

describe("harness doctor", () => {
  it("reports healthy", async () => {
    const t = createTestDeps();
    await cmdDoctor(t.deps, parseArgs([]));
    expect(t.out[0]).toBe("store healthy — no findings");
    expect(t.exitCode).toBeUndefined();
  });

  it("exits 1 on error findings", async () => {
    const store = createMockStore();
    store.doctor = async () => ({
      ok: false,
      findings: [
        { severity: "error", code: "lock-corrupt", message: "extensions.lock is corrupt" },
      ],
    });
    const t = createTestDeps({ store });
    await cmdDoctor(t.deps, parseArgs(["--json"]));
    expect(JSON.parse(t.out[0]).findings).toHaveLength(1);
    expect(t.exitCode).toBe(1);
  });
});

describe("harness audit", () => {
  const LOG = [
    JSON.stringify({ ts: "t1", event: "install", actor: "user", extension: { name: "a", version: "1" } }),
    '{"broken":', // partial line — skipped
    JSON.stringify({ ts: "t2", event: "exec.deny", actor: "agent", extension: { name: "b", version: "2" }, decision: "deny" }),
  ].join("\n");

  it("reads audit.log via the fs port, skipping partial lines", async () => {
    const fs = createMemoryFs({ "/test/.agents/harness/audit.log": LOG });
    const t = createTestDeps();
    t.deps.fs = fs;
    await cmdAudit(t.deps, parseArgs(["--json"]));
    const out = JSON.parse(t.out[0]);
    expect(out.events).toHaveLength(2);
    expect(out.total).toBe(2);
  });

  it("filters by --event and --limit", async () => {
    const fs = createMemoryFs({ "/test/.agents/harness/audit.log": LOG });
    const t = createTestDeps();
    t.deps.fs = fs;
    await cmdAudit(t.deps, parseArgs(["--event", "exec.deny", "--json"]));
    const out = JSON.parse(t.out[0]);
    expect(out.events).toHaveLength(1);
    expect(out.events[0].actor).toBe("agent");
  });

  it("handles a missing log", async () => {
    const t = createTestDeps();
    await cmdAudit(t.deps, parseArgs([]));
    expect(t.out[0]).toBe("no audit log yet");
  });
});

describe("parseAuditLog", () => {
  it("tolerates empty input", () => {
    expect(parseAuditLog("")).toEqual([]);
  });
});
