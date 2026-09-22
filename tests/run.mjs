import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
mkdirSync("test-results", { recursive: true });
await build({
  entryPoints: ["tests/core.test.ts"],
  outfile: "test-results/core.test.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
const result = spawnSync(
  process.execPath,
  ["--test", "test-results/core.test.mjs"],
  { stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
