import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e/**",
    ".next-validate/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "test-results/**",
  ]),
  {
    rules: {
      "id-length": [
        "error",
        {
          min: 2,
          exceptions: ["i", "j", "k", "_"],
          properties: "never",
        },
      ],
    },
  },
  eslintConfigPrettier,
]);

export default eslintConfig;
