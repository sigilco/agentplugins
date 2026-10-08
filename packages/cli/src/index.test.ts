import { describe, expect, it } from "vitest";

import * as mod from "./index.js";

describe("@any-harness/cli", () => {
  it("loads", () => {
    expect(mod).toBeDefined();
  });
});
