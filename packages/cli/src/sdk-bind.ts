/**
 * The ONE file that imports `@any-harness/sdk`.
 *
 * W8 implements the sdk in parallel against the same pinned names
 * (`api.ts`); while `packages/sdk` is still a stub (`export {}`) this
 * module casts the namespace through `unknown` so typecheck stays green
 * and every call site gets a clear runtime error instead of
 * `undefined is not a function`. When the sdk lands, the cast is a no-op.
 */
import * as sdk from "@any-harness/sdk";

import type { SdkApi } from "./api.js";
import { CliError } from "./errors.js";

const bound = sdk as unknown as Partial<SdkApi>;

const requireFn = <K extends keyof SdkApi>(name: K): SdkApi[K] => {
  const fn = bound[name] as unknown;
  if (typeof fn !== "function") {
    throw new CliError(
      "sdk-unavailable",
      `@any-harness/sdk does not export ${String(name)} yet — the sdk workstream (W8) has not merged; this is expected on the feat/cli branch`,
    );
  }
  return fn as SdkApi[K];
};

/** Lazily resolves each pinned export; throws CliError("sdk-unavailable"). */
export const sdkApi: SdkApi = {
  createStore: (...args) => requireFn("createStore")(...args),
  resolveSource: (...args) => requireFn("resolveSource")(...args),
  handleBridgeRequest: (...args) =>
    requireFn("handleBridgeRequest")(...args),
};
