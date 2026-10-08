export { aiSdkHarness } from "./ai-sdk.js";
export {
  BRIDGE_OPS,
  BridgeError,
  inProcessBridge,
} from "./bridge.js";
export type {
  BridgeClient,
  BridgeHandlers,
  BridgeOp,
  BridgeOps,
  Extension,
  ExtensionKind,
  ManifestRef,
} from "./bridge.js";
export type {
  AgentHarness,
  AgentSpec,
  Capabilities,
  ExecPort,
  ExecResult,
  HarnessRunInput,
  SecretPort,
  StoragePort,
} from "./harness.js";
export { extensionTools } from "./tools.js";
