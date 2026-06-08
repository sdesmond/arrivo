import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";
import dotenv from "dotenv";

dotenv.config();

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
  },
  webServer: {
    command: "npm run dev -- -p 3001",
    url: "http://localhost:3001",
    reuseExistingServer,
    timeout: 300_000,
    env: {
      DATABASE_URL: process.env.E2E_DATABASE_URL!,
      NEXTAUTH_URL: "http://localhost:3001",
      NEXT_DISTDIR: ".next-e2e",
      PACKT_E2E: "true",
      E2E_MAPBOX_STUB: "true",
      UPLOAD_STUB: "true",
    },
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/, testDir: "tests/e2e" },
    // Scenario-fixture self-tests. They hit the live packt_e2e DB directly (no browser/auth) and
    // run here instead of as a second Vitest process so only one Vitest runs under the validator.
    { name: "fixtures", testMatch: /scenario-fixture\.spec\.ts/, testDir: "tests/e2e" },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "tests/e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
});
