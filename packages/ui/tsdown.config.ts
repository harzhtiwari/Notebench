import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  target: "es2022",
  platform: "neutral",
  sourcemap: true,
  treeshake: true,
  deps: {
    neverBundle: ["react", "react-dom"],
  },
});
