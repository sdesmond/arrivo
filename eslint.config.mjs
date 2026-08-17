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
  {
    // Application source only — build/dev tooling under scripts/** legitimately needs direct fs access.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "node:fs",
              message: "Use the StorageAdapter port from @/lib/storage instead of importing node:fs directly.",
            },
            {
              name: "node:fs/promises",
              message: "Use the StorageAdapter port from @/lib/storage instead of importing node:fs/promises directly.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/lib/storage/local-filesystem-adapter.ts",
      "src/lib/storage/local-filesystem-adapter.test.ts",
      "src/lib/local-upload.ts",
      "src/lib/local-upload.test.ts",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  eslintConfigPrettier,
]);

export default eslintConfig;
