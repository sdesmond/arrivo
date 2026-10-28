import { test as base, createBdd } from "playwright-bdd";
import { selectWorkerDatabase } from "../../scripts/e2e-bootstrap.mjs";
import {
  cleanupScenarioFixtureContext,
  createScenarioFixtureContext,
  type ScenarioFixtureContext,
} from "./scenario-fixture";

export interface E2EWorkerOptions {
  bootstrapDatabase: boolean;
  _selectE2EDatabase: void;
}

export const test = base.extend<{ scenario: ScenarioFixtureContext }, E2EWorkerOptions>({
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
});

export const { Given, When, Then, Before, After } = createBdd(test);
