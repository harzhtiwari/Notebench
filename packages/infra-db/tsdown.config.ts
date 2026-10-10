import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/schema/index.ts",
    "src/sqlite/index.ts",
    "src/pg/index.ts",
    "src/migrator/index.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  target: "node22",
  platform: "neutral",
  sourcemap: true,
  treeshake: true,
  deps: {
    neverBundle: [/^node:/, "better-sqlite3", "pg", "drizzle-orm"],
  },
});
