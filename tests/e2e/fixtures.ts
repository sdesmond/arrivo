import { test as base, createBdd } from "playwright-bdd";
import {
  cleanupScenarioFixtureContext,
  createScenarioFixtureContext,
  type ScenarioFixtureContext,
} from "./scenario-fixture";

export const test = base.extend<{ scenario: ScenarioFixtureContext }>({
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
