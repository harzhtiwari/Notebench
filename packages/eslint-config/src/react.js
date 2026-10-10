import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import baseConfig from "./base.js";

/**
 * ESLint 9 Flat Config for React packages (UI, Editor, Canvas).
 * @type {import('typescript-eslint').Config}
 */
export const reactConfig = tseslint.config(
  ...baseConfig,
  {
    files: ["**/*.tsx", "**/*.jsx"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      ...reactHooksPlugin.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/jsx-no-target-blank": "error",
    },
  }
);

export default reactConfig;
