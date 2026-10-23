import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";
import dotenv from "dotenv";
import { E2E_STORAGE_DIRECTORY } from "./scripts/e2e-storage.mjs";

dotenv.config();

// E2E assumes one local timezone, same as Vitest (vitest.config.mts): Linked Events and day bucketing use the
// server's local date, steps compute floating "now" in the runner, and client components read browser-local time.
// Pin all three so results do not change between a developer machine and a UTC host. A reused server
// (E2E_REUSE_SERVER) keeps whatever timezone it was started with.
const E2E_TIMEZONE = "America/Denver";
process.env.TZ = E2E_TIMEZONE;

const workers = Number(process.env.PLAYWRIGHT_WORKERS ?? "4");
const reuseExistingServer = process.env.E2E_REUSE_SERVER === "true";

const testDir = defineBddConfig({
  features: "tests/e2e/features/**/*.feature",
  steps: "tests/e2e/steps/**/*.ts",
  importTestFrom: { file: "tests/e2e/fixtures.ts", varName: "test" },
});

export default defineConfig({
  globalSetup: "./tests/e2e/global-setup.ts",
  testDir,
  workers,
  use: {
    baseURL: "http://localhost:3001",
    timezoneId: E2E_TIMEZONE,
  },
  webServer: {
    command: "npm run dev -- -p 3001",
    url: "http://localhost:3001",
    reuseExistingServer,
    timeout: 300_000,
    env: {
      TZ: E2E_TIMEZONE,
      DATABASE_URL: process.env.E2E_DATABASE_URL!,
      NEXTAUTH_URL: "http://localhost:3001",
      NEXT_DISTDIR: ".next-e2e",
      E2E_MODE: "true",
      E2E_MAPBOX_STUB: "true",
      E2E_UNSPLASH_STUB: "true",
      STORAGE_PROVIDER: "local",
      STORAGE_LOCAL_ROOT_DIR: E2E_STORAGE_DIRECTORY,
    },
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/, testDir: "tests/e2e" },
    // Scenario-fixture self-tests. They hit the live arrivo_e2e DB directly (no browser/auth) and
    // run here instead of as a second Vitest process so only one Vitest runs under the validator.
    { name: "fixtures", testMatch: /scenario-fixture\.spec\.ts/, testDir: "tests/e2e" },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "tests/e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
});
