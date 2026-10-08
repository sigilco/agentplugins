import type { StorePorts } from "../api.js";
import { createExecPort } from "./exec.js";
import { createFsPort } from "./fs.js";

/** Node-side `StorePorts` — fs first, exec second (fs.symlink uses `ln`). */
export const createNodePorts = (): StorePorts => {
  const exec = createExecPort();
  return { fs: createFsPort(exec), exec };
};
