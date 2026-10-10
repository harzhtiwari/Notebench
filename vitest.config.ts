import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    passWithNoTests: true,
    include: ["**/*.test.ts", "**/*.spec.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "e2e/**",
      "**/e2e/**",
      ".notebook/**",
      ".tmp/**",
    ],
    typecheck: {
      enabled: false,
      include: ["**/*.test-d.ts"],
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "e2e/**",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/*.test-d.ts",
      ],
    },
  },
});
