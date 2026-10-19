import { nextConfig } from "@notebench/eslint-config";

export default [
  ...nextConfig,
  {
    // Next's generated tsconfig includes every root `.ts` file, so these two
    // config files are already owned by the TypeScript project service.
    // Listing a project-owned file in the shared `allowDefaultProject` is a
    // parse error; they still get typechecked via `pnpm typecheck`.
    ignores: ["next.config.ts", "vitest.config.ts"],
  },
];
