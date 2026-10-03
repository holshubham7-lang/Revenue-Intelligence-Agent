// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: "module",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "no-console": ["error", { allow: ["warn", "error", "log"] }],
      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
    },
  },
  {
    /* The ported domain modules are plain functions with no Nest dependency;
       console output there is deliberate operational logging. */
    files: ["src/**/*.test.ts", "src/**/identity.ts", "src/db.ts", "src/content.ts"],
    rules: { "no-console": "off" },
  },
  {
    /* `safeLabel` strips control characters out of user-supplied column names.
       Matching them in a regex is the mechanism, not an accident, and the source
       is ASCII-escaped so the file itself holds no control bytes. */
    files: ["src/data/metrics.ts"],
    rules: { "no-control-regex": "off" },
  },
);
