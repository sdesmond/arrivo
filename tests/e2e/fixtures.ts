import { test as base, createBdd } from "playwright-bdd";
import type { Browser, Page } from "@playwright/test";
import { selectWorkerDatabase } from "../../scripts/e2e-bootstrap.mjs";
import {
  cleanupScenarioFixtureContext,
  createScenarioFixtureContext,
  type ScenarioFixtureContext,
} from "./scenario-fixture";
import {
  createSecurityPolicyApp,
  type SecurityPolicyApp,
  type SecurityPolicyAppOptions,
  type SecurityPolicyUser,
} from "./security-policy-fixture";

export interface E2EWorkerOptions {
  bootstrapDatabase: boolean;
  _selectE2EDatabase: void;
}

/**
 * A scenario-owned app: its own migrated database, its own Next process, and the signed-out browsers that talk to it.
 * Nothing starts until `start`, so scenarios that never touch password rules pay nothing. Teardown closes the
 * browsers, stops the process and drops the database even when the scenario fails.
 */
export interface PolicyAppRegistry {
  start(options?: Omit<SecurityPolicyAppOptions, "slot">): Promise<SecurityPolicyApp>;
  /** The running app; throws if `start` has not run. */
  readonly app: SecurityPolicyApp;
  /** Users seeded for this scenario, by role label ("admin", "member", ...). */
  readonly users: Map<string, SecurityPolicyUser>;
  /** A fresh browser with no cookies pointed at the app, remembered under `label`. */
  openBrowser(label: string): Promise<Page>;
  browser(label: string): Page;
}

const POLICY_APP_TIMEOUT_MS = 600_000;

async function createPolicyAppRegistry(
  browser: Browser,
  slot: number,
  extendTimeout: (milliseconds: number) => void
): Promise<{ registry: PolicyAppRegistry; teardown: () => Promise<void> }> {
  let app: SecurityPolicyApp | undefined;
  const users = new Map<string, SecurityPolicyUser>();
  const pages = new Map<string, Page>();
  const registry: PolicyAppRegistry = {
    async start(options = {}) {
      if (app) throw new Error("The password-policy app is already running for this scenario.");
      // A cold Next dev compile of several pages outlasts the default per-test timeout.
      extendTimeout(POLICY_APP_TIMEOUT_MS);
      app = await createSecurityPolicyApp({ ...options, slot });
      return app;
    },
    get app() {
      if (!app) throw new Error("Start the password-policy app first.");
      return app;
    },
    users,
    async openBrowser(label) {
      const context = await browser.newContext({
        baseURL: registry.app.baseURL,
        storageState: { cookies: [], origins: [] },
        timezoneId: "America/Denver",
      });
      const page = await context.newPage();
      pages.set(label, page);
      return page;
    },
    browser(label) {
      const page = pages.get(label);
      if (!page) throw new Error(`No "${label}" browser is open.`);
      return page;
    },
  };
  const teardown = async () => {
    await Promise.all(
      [...pages.values()].map((page) =>
        page
          .context()
          .close()
          .catch(() => undefined)
      )
    );
    await app?.stop();
  };
  return { registry, teardown };
}

export const test = base.extend<{ scenario: ScenarioFixtureContext; policyApp: PolicyAppRegistry }, E2EWorkerOptions>({
  bootstrapDatabase: [false, { option: true, scope: "worker" }],
  _selectE2EDatabase: [
    async ({ bootstrapDatabase }, runWorker) => {
      const source = process.env.E2E_DATABASE_URL;
      process.env.E2E_DATABASE_URL = selectWorkerDatabase(source, bootstrapDatabase);
      try {
        await runWorker();
      } finally {
        if (source === undefined) delete process.env.E2E_DATABASE_URL;
        else process.env.E2E_DATABASE_URL = source;
      }
    },
    { scope: "worker", auto: true },
  ],
  scenario: async ({}, runFixture, testInfo) => {
    const scenario = createScenarioFixtureContext(testInfo);
    try {
      await runFixture(scenario);
    } finally {
      await cleanupScenarioFixtureContext(scenario);
    }
  },
  policyApp: async ({ browser }, runFixture, testInfo) => {
    const { registry, teardown } = await createPolicyAppRegistry(browser, testInfo.parallelIndex, (milliseconds) =>
      testInfo.setTimeout(milliseconds)
    );
    try {
      await runFixture(registry);
    } finally {
      await teardown();
    }
  },
});

export const { Given, When, Then, Before, After } = createBdd(test);
