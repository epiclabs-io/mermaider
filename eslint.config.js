import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import unusedImportsPlugin from "eslint-plugin-unused-imports";

export default [
  { ignores: ["dist/**", "node_modules/**"] },
  {
    files: [
      "lib/*/src/**/*.ts",
      "lib/*/tests/**/*.ts",
      "apps/*/src/**/*.ts",
      "apps/*/tests/**/*.ts",
      "scripts/**/*.ts",
      "vitest.config.ts",
    ],
    languageOptions: { parser: tsParser },
    plugins: { "@typescript-eslint": tsPlugin, "unused-imports": unusedImportsPlugin },
    rules: { curly: ["error", "all"], "unused-imports/no-unused-imports": "error" },
  },
];
