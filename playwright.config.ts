import { defineConfig, devices, type PlaywrightTestOptions } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";
import dotenv from "dotenv";
import { E2E_STORAGE_DIRECTORY, BOOTSTRAP_E2E_STORAGE_DIRECTORY } from "./scripts/e2e-storage.mjs";
import { BOOTSTRAP_E2E_PORT, deriveBootstrapConnectionString } from "./scripts/e2e-bootstrap.mjs";
import type { E2EWorkerOptions } from "./tests/e2e/fixtures";

dotenv.config();
// Failure page snapshots can contain one-time setup links even when screenshots/traces are disabled.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

// E2E assumes one local timezone, same as Vitest (vitest.config.mts): Linked Events and day bucketing use the
// server's local date, steps compute floating "now" in the runner, and client components read browser-local time.
// Pin all three so results do not change between a developer machine and a UTC host. A reused server
// (E2E_REUSE_SERVER) keeps whatever timezone it was started with.
const E2E_TIMEZONE = "America/Denver";
process.env.TZ = E2E_TIMEZONE;

// Two workers: four against the Next dev server produced timeouts in unrelated features on the full suite.
const workers = Number(process.env.PLAYWRIGHT_WORKERS ?? "2");
const reuseExistingServer = process.env.E2E_REUSE_SERVER === "true";

const testDir = defineBddConfig({
  features: "tests/e2e/features/**/*.feature",
  steps: "tests/e2e/steps/**/*.ts",
  importTestFrom: { file: "tests/e2e/fixtures.ts", varName: "test" },
});

const regularPort = Number(process.env.PORT ?? "3001");
const bootstrapFeature = /app-bootstrap\.feature\.spec\.js$/;

function appServer(port: number, bootstrap: boolean) {
  const baseURL = "http://localhost:" + port;
  return {
    command: "npm run dev -- -p " + port,
    url: baseURL,
    reuseExistingServer,
    timeout: 300_000,
    env: {
      TZ: E2E_TIMEZONE,
      DATABASE_URL: bootstrap
        ? deriveBootstrapConnectionString(process.env.E2E_DATABASE_URL!)
        : process.env.E2E_DATABASE_URL!,
      NEXTAUTH_URL: baseURL,
      NEXT_DISTDIR: bootstrap ? ".next-e2e-bootstrap" : ".next-e2e",
      ACTIVITY_MAINTENANCE_INTERVAL_HOURS: "0",
      E2E_MODE: "true",
      E2E_MAPBOX_STUB: "true",
      E2E_UNSPLASH_STUB: "true",
      STORAGE_PROVIDER: "local",
      STORAGE_LOCAL_ROOT_DIR: bootstrap ? BOOTSTRAP_E2E_STORAGE_DIRECTORY : E2E_STORAGE_DIRECTORY,
    },
  };
}

export default defineConfig<PlaywrightTestOptions, E2EWorkerOptions>({
  globalSetup: "./tests/e2e/global-setup.ts",
  testDir,
  workers,
  use: {
    // Setup-link scenarios handle credentials in memory; never capture their requests or UI.
    trace: "off",
    screenshot: "off",
    video: "off",
    baseURL: "http://localhost:" + regularPort,
    timezoneId: E2E_TIMEZONE,
  },
  webServer: [appServer(regularPort, false), appServer(BOOTSTRAP_E2E_PORT, true)],
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/, testDir: "tests/e2e" },
    // Scenario-fixture self-tests. They hit the live arrivo_e2e DB directly (no browser/auth) and
    // run here instead of as a second Vitest process so only one Vitest runs under the validator.
    { name: "fixtures", testMatch: /scenario-fixture\.spec\.ts/, testDir: "tests/e2e" },
    {
      name: "chromium",
      testIgnore: bootstrapFeature,
      use: { ...devices["Desktop Chrome"], storageState: "tests/e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
    {
      name: "bootstrap",
      testMatch: bootstrapFeature,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:" + BOOTSTRAP_E2E_PORT,
        storageState: { cookies: [], origins: [] },
        bootstrapDatabase: true,
      },
    },
  ],
});
