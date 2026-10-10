import tseslint from "typescript-eslint";
import reactConfig from "./react.js";

/**
 * ESLint 9 Flat Config for Next.js applications (apps/web).
 * @type {import('typescript-eslint').Config}
 */
export const nextConfig = tseslint.config(
  ...reactConfig,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: {
            attributes: false,
          },
        },
      ],
    },
  }
);

export default nextConfig;
