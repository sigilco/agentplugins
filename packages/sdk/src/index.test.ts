import { describe, expect, it } from "vitest";

import * as mod from "./index.js";

describe("@any-harness/sdk", () => {
  it("loads", () => {
    expect(mod).toBeDefined();
  });
});
