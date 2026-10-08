import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  // ".js" output (package is type:module) — ci.yml smoke-tests dist/cli.js.
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  // Workspace dep stays external — resolved through pnpm at runtime.
  deps: { neverBundle: ["@any-harness/sdk"] },
  sourcemap: true,
  clean: true,
  minify: false,
});
