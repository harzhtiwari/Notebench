import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/app.ts"],
  format: "esm",
  target: "node22",
  clean: true,
  dts: true,
});
