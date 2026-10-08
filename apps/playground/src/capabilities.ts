import type { Capabilities, SecretPort, StoragePort } from "@any-harness/metaharness";
import { createStorage, type StorageValue } from "unstorage";
import fsDriver from "unstorage/drivers/fs";

import { demoBridge } from "./host.js";

const storagePort = (base: string): StoragePort => {
  const storage = createStorage({ driver: fsDriver({ base }) });
  return {
    get: (key) => storage.getItem(key),
    set: async (key, value) => {
      await storage.setItem(key, value as StorageValue);
    },
    delete: async (key) => {
      await storage.removeItem(key);
    },
  };
};

/** Env map → SecretPort. The host injects the map; nothing reads globals. */
const secretPort = (env: Record<string, string | undefined>): SecretPort => ({
  resolve: (name) => env[name],
});

export interface PlaygroundCapabilitiesOptions {
  /** Injected environment (e.g. `process.env`) for the BYOK secret slot. */
  env: Record<string, string | undefined>;
  /** Directory for the unstorage fs driver. */
  storeDir: string;
}

export const createPlaygroundCapabilities = (
  options: PlaygroundCapabilitiesOptions,
): Capabilities => ({
  storage: storagePort(options.storeDir),
  secrets: secretPort(options.env),
  bridge: demoBridge(),
  // Computer-only slot: the playground is a demo harness, so exec is a stub
  // that reports unavailability rather than a real process runner. A computer
  // build injects a real ExecPort; a browser build injects nothing and the
  // same tools degrade cleanly.
  exec: {
    run: (command) =>
      Promise.resolve({
        code: 127,
        stdout: "",
        stderr: `exec stub: playground does not run commands (computer-only slot): ${command}`,
      }),
  },
});
