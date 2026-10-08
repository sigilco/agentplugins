import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  // ".js" output (package is type:module) — ci.yml smoke-tests dist/cli.js.
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  // Workspace dep is bundled in — dist/cli.js must run standalone
  // (scriptc packaging ships a single self-contained artifact).
  deps: { alwaysBundle: ["@any-harness/sdk"] },
  sourcemap: true,
  clean: true,
  minify: false,
});
