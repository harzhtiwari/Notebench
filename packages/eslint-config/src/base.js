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
      // Naming follows GLOSSARY.md and the package map (DocWorker, CitationRef, ...);
      // the curated rename table would fight the project vocabulary.
      "unicorn/name-replacements": "off",
      // `getHTML()`/`setHTML()` are missing from happy-dom and not broadly supported
      // in browsers; `innerHTML` is the supported API for this codebase.
      "unicorn/prefer-dom-node-html-methods": "off",
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
        projectService: {
          allowDefaultProject: ["*.config.ts", "*.config.mts"],
        },
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
      // Numbers stringify safely in templates; keep the rule focused on
      // objects/arrays that would render as `[object Object]`.
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowNumber: true,
        },
      ],
      // `while (true)` is an explicit, intentional loop form; other constant
      // conditions are still reported.
      "@typescript-eslint/no-unnecessary-condition": [
        "error",
        { allowConstantLoopConditions: "only-allowed-literals" },
      ],
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
  },
  {
    // Test doubles implement Promise-returning ports without awaiting anything,
    // and stub callbacks are intentionally empty.
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.test-d.ts"],
    rules: {
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-empty-function": "off",
    },
  },
  {
    // Config files (tsdown/next/vitest) execute at module load by design.
    files: ["**/*.config.ts", "**/*.config.mts", "**/*.config.js", "**/*.config.mjs"],
    rules: {
      "unicorn/no-top-level-side-effects": "off",
    },
  }
);

export default baseConfig;
