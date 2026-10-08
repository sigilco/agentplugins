import { describe, expect, it } from "vitest";

import * as mod from "./index.js";

describe("@any-harness/spec", () => {
  it("loads", () => {
    expect(mod).toBeDefined();
  });
});
