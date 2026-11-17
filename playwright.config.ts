import { defineConfig, devices, type PlaywrightTestOptions } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";
import dotenv from "dotenv";
import { availableParallelism } from "node:os";
import { E2E_STORAGE_DIRECTORY, BOOTSTRAP_E2E_STORAGE_DIRECTORY } from "./scripts/e2e-storage.mjs";
import { BOOTSTRAP_E2E_PORT, deriveBootstrapConnectionString } from "./scripts/e2e-bootstrap.mjs";
import { E2E_TIMEZONE, e2eServerEnv } from "./scripts/e2e-server.mjs";
import type { E2EWorkerOptions } from "./tests/e2e/fixtures";

dotenv.config();
// Failure page snapshots can contain one-time setup links even when screenshots/traces are disabled.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

// Pin the runner, server and browser to one timezone (see E2E_TIMEZONE) so results do not change between a
// developer machine and a UTC host. A reused server (E2E_REUSE_SERVER) keeps whatever timezone it was started with.
process.env.TZ = E2E_TIMEZONE;

// Half the machine's logical CPUs, 2 to 6. Workers are bound by Postgres, not memory (the production server stays under
// 0.5 GB): every password-policy scenario starts its own app server holding about 12 connections, so with one on each
// worker, 6 workers plus the shared servers stay inside the default max_connections (100) and 8 do not.
const defaultWorkers = Math.min(6, Math.max(2, Math.floor(availableParallelism() / 2)));
const workers = Number(process.env.PLAYWRIGHT_WORKERS ?? defaultWorkers);
const reuseExistingServer = process.env.E2E_REUSE_SERVER === "true";

const testDir = defineBddConfig({
  features: "tests/e2e/features/**/*.feature",
  steps: "tests/e2e/steps/**/*.ts",
  importTestFrom: { file: "tests/e2e/fixtures.ts", varName: "test" },
});

const regularPort = Number(process.env.PORT ?? "3001");
const bootstrapFeature = /app-bootstrap\.feature\.spec\.js$/;

// Serves the production build that scripts/run-e2e.mjs makes before Playwright starts (scripts/e2e-server.mjs).
function appServer(port: number, bootstrap: boolean) {
  return {
    command: "npm run start -- -p " + port,
    url: "http://localhost:" + port,
    reuseExistingServer,
    timeout: 300_000,
    env: e2eServerEnv({
      port,
      databaseUrl: bootstrap
        ? deriveBootstrapConnectionString(process.env.E2E_DATABASE_URL!)
        : process.env.E2E_DATABASE_URL!,
      storageRoot: bootstrap ? BOOTSTRAP_E2E_STORAGE_DIRECTORY : E2E_STORAGE_DIRECTORY,
    }),
  };
}

export default defineConfig<PlaywrightTestOptions, E2EWorkerOptions>({
  globalSetup: "./tests/e2e/global-setup.ts",
  testDir,
  workers,
  // Scenarios own their rows, so a feature's scenarios spread across workers too; otherwise the longest feature
  // (api.feature, ~20 minutes in one worker) sets the length of the whole run.
  fullyParallel: true,
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
    // The password-policy fixture spec creates and drops its own sibling databases instead.
    { name: "fixtures", testMatch: /(scenario|security-policy)-fixture\.spec\.ts/, testDir: "tests/e2e" },
    {
      name: "chromium",
      testIgnore: bootstrapFeature,
      use: { ...devices["Desktop Chrome"], storageState: "tests/e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
    {
      name: "bootstrap",
      testMatch: bootstrapFeature,
      // Every bootstrap scenario resets the one bootstrap app's database to a fresh install, so they cannot overlap.
      fullyParallel: false,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:" + BOOTSTRAP_E2E_PORT,
        storageState: { cookies: [], origins: [] },
        bootstrapDatabase: true,
      },
    },
  ],
});
