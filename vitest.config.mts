import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "node:path";

// Unit tests assume one local timezone (e.g. a flight that departs and lands on the same local day). Pin it so
// results do not change between a developer machine and a UTC CI runner.
process.env.TZ = "America/Denver";

export default defineConfig({
  resolve: {
    alias: {
      "next/server": resolve("./node_modules/next/server.js"),
      "server-only": resolve("./tests/support/server-only.ts"),
    },
  },
  plugins: [tsconfigPaths(), react()],
  test: {
    globals: true,
    passWithNoTests: true,
    environment: "jsdom",
    // Hermetic unit/coverage suite only — no live database. Live-DB E2E fixture self-tests run as a
    // dedicated Playwright project (see playwright.config.ts), inside the E2E pipeline after the DB
    // is migrated. Keeping them there ensures only ONE Vitest process runs under the build-validator
    // — two concurrent Vitest processes race Vite's shared temp dir and intermittently crash both.
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "scripts/**/*.{test,spec}.mjs",
      "tests/e2e/server-action.test.ts",
      "tests/e2e/dialog.test.ts",
      "tests/e2e/onboarding-browser.test.ts",
    ],
    setupFiles: ["./vitest.setup.mts"],
    server: {
      deps: {
        inline: ["next-auth"],
      },
    },
    coverage: {
      provider: "v8",
      thresholds: { lines: 95, functions: 95, branches: 90 },
      include: ["src/lib/**", "src/components/**"],
      exclude: [
        "src/lib/auth-helpers.ts",
        "src/lib/queries.ts",
        "src/lib/server-now.ts",
        "src/app/**",
        "src/components/ui/**",
        "src/components/providers/**",
        "src/components/arrivo/trip-rail.tsx",
        "src/components/arrivo/trips-mobile-tabs.tsx",
      ],
    },
  },
});
