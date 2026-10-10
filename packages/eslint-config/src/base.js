import js from "@eslint/js";
import tseslint from "typescript-eslint";
import tsdocPlugin from "eslint-plugin-tsdoc";
import turboPlugin from "eslint-plugin-turbo";
import securityPlugin from "eslint-plugin-security";
import unicornPlugin from "eslint-plugin-unicorn";

/**
 * Base ESLint 9 Flat Config for Node.js backend, CLI tools, and domain packages.
 * @type {import('typescript-eslint').Config}
 */
export const baseConfig = tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/out/**",
      "**/.tmp/**",
      "**/.notebook/**",
      "**/coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  securityPlugin.configs.recommended,
  unicornPlugin.configs.recommended,
  {
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      "turbo/no-undeclared-env-vars": "error",
      "unicorn/prevent-abbreviations": "off",
      "unicorn/no-null": "off",
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      tsdoc: tsdocPlugin,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": [
        "error",
        {
          fixToUnknown: false,
          ignoreRestArgs: false,
        },
      ],
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          ignoreVoid: true,
          ignoreIIFE: false,
        },
      ],
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          vars: "all",
          varsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "tsdoc/syntax": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
          disallowTypeAnnotations: false,
        },
      ],
    },
  },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    ...tseslint.configs.disableTypeChecked,
  }
);

export default baseConfig;
