import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["**/.next/**", "**/node_modules/**", "apps/web/next-env.d.ts"] },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      "no-constant-condition": "error",
      "no-unreachable": "error",
    },
  },
  {
    ...reactHooks.configs.flat.recommended,
    files: ["apps/web/**/*.tsx", "apps/web/**/*.ts"],
  },
];
