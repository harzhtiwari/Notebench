import { defineConfig } from "vitest/config";

// Matches the Next.js automatic JSX runtime so component tests transform
// exactly like the app bundle (without this, tsx tests fail with
// `React is not defined` under esbuild's classic transform).
export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
});
