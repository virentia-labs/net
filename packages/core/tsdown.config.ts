import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["lib/index.ts", "lib/adapters/tanstack.ts", "lib/adapters/apollo.ts"],
  outDir: "dist",
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
});
