import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  // Workspace dep stays external — resolved through pnpm at runtime.
  deps: { neverBundle: ["@any-harness/sdk"] },
  sourcemap: true,
  clean: true,
  minify: false,
});
