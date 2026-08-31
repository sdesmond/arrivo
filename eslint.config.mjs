import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier";

const storagePortMessage =
  "Use the StorageAdapter port from @/lib/storage instead of importing storage backends directly.";

const blobImportRestrictions = {
  paths: [
    {
      name: "@vercel/blob",
      message: storagePortMessage,
    },
  ],
  patterns: [
    {
      group: ["@vercel/blob/*"],
      message: storagePortMessage,
    },
  ],
};

const filesystemImportRestrictions = ["fs", "fs/promises", "node:fs", "node:fs/promises"].map((name) => ({
  name,
  message: "Use the StorageAdapter port from @/lib/storage instead of importing filesystem APIs directly.",
}));

const applicationStorageImportRestrictions = {
  paths: [...blobImportRestrictions.paths, ...filesystemImportRestrictions],
  patterns: blobImportRestrictions.patterns,
};

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
    ".features-gen/**",
    "_bmad/**",
    "_bmad-output/**",
    ".agents/**",
    ".claude/**",
    ".opencode/**",
    ".playwright-mcp/**",
    ".ui-review-screenshots/**",
  ]),
  {
    rules: {
      "no-restricted-imports": ["error", blobImportRestrictions],
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
    files: ["src/**/*.{js,mjs,ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", applicationStorageImportRestrictions],
    },
  },
  {
    files: ["src/lib/storage/local-filesystem-adapter.ts", "src/lib/storage/local-filesystem-adapter.test.ts"],
    rules: {
      "no-restricted-imports": ["error", blobImportRestrictions],
    },
  },
  eslintConfigPrettier,
]);

export default eslintConfig;
