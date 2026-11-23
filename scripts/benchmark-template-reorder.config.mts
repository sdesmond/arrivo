import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "node:path";

export default defineConfig({
  resolve: { alias: { "server-only": resolve("tests/support/server-only.ts") } },
  plugins: [tsconfigPaths()],
  test: { environment: "node", include: ["scripts/benchmark-template-reorder.integration.ts"], testTimeout: 600000 },
});
