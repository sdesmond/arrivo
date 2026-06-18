import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    globals: true,
    passWithNoTests: true,
    environment: "jsdom",
    // Hermetic unit/coverage suite only — no live database. Live-DB E2E fixture self-tests run as a
    // dedicated Playwright project (see playwright.config.ts), inside the E2E pipeline after the DB
    // is migrated. Keeping them there ensures only ONE Vitest process runs under the build-validator
    // — two concurrent Vitest processes race Vite's shared temp dir and intermittently crash both.
    include: ["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.{test,spec}.mjs"],
    setupFiles: ["./vitest.setup.mts"],
    coverage: {
      provider: "istanbul",
      thresholds: { lines: 95, functions: 95, branches: 90 },
      include: ["src/lib/**", "src/components/**"],
      exclude: [
        "src/lib/auth-helpers.ts",
        "src/lib/queries.ts",
        "src/lib/server-now.ts",
        "src/app/**",
        "src/components/ui/**",
        "src/components/providers/**",
        "src/components/packt/trip-rail.tsx",
        "src/components/packt/trips-mobile-tabs.tsx",
      ],
    },
  },
});
