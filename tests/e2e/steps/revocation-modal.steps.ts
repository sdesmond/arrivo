import { expect, type BrowserContext, type Page } from "@playwright/test";
import { collaborators } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { After, Given, Then, When } from "../fixtures";
import type { ScenarioFixtureContext } from "../scenario-fixture";
import { waitForLiveSyncResponse } from "../live-sync";

const REMOVED_PAGE_KEY = "revocationModalRemovedPage";
const REMOVED_CONTEXT_KEY = "revocationModalRemovedContext";
const REMOVED_NAME_KEY = "revocationModalRemovedName";

async function openTripWithPersonalChannel(page: Page, tripId: string): Promise<void> {
  const personalChannelReady = waitForLiveSyncResponse(page, "/api/users/me/events");
  await Promise.all([page.goto(`/trips/${tripId}`), personalChannelReady]);
  await page.waitForURL(/\/trips\/.+/);
}

async function signInAsRemovedUser(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/trips");
}

function getRemovedPage(scenario: ScenarioFixtureContext): Page {
  const removedPage = scenario.getValue<Page>(REMOVED_PAGE_KEY);
  if (!removedPage) throw new Error("No removed session is open for this scenario.");
  return removedPage;
}

async function removeNamedContributorAndSave(page: Page, scenario: ScenarioFixtureContext): Promise<void> {
  const removedName = scenario.getValue<string>(REMOVED_NAME_KEY);
  if (!removedName) throw new Error("No removed contributor is set up for this scenario.");

  await scenario.gotoCurrentTrip(page);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Share trip" })).toBeVisible();

  await page.getByTitle(`Remove ${removedName}`).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Contributor changes saved.")).toBeVisible();
}

async function assertRevocationModalNamesRemover(scenario: ScenarioFixtureContext): Promise<void> {
  const removedPage = getRemovedPage(scenario);
  const trip = await scenario.ensureCurrentTrip();
  const remover = scenario.currentUser;

  await expect(removedPage.getByText(trip.name, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  if (remover) {
    await expect(removedPage.getByText(remover.name, { exact: false }).first()).toBeVisible();
  }
  await expect(removedPage.getByRole("button", { name: "OK", exact: true })).toBeVisible();
}

Given("I have a contributor viewing my trip in their own session", async ({ page, scenario }) => {
  const trip = await scenario.ensureCurrentTrip();

  const { user: contributor } = await scenario.materialize({
    user: { overrides: { user: { name: "Revocation Contributor", initials: "RC" } }, setCurrent: false },
  });
  if (!contributor) throw new Error("Failed to materialize the contributor user.");

  await withE2EDb(async (db) => {
    await db.insert(collaborators).values({
      tripId: trip.id,
      userId: contributor.id,
      email: contributor.email,
      name: contributor.name,
      initials: contributor.initials,
      role: "editor",
      isCreator: false,
    });
  });

  const contributorContext = await page.context().browser()!.newContext();
  const contributorPage = await contributorContext.newPage();
  await signInAsRemovedUser(contributorPage, contributor.email);
  await openTripWithPersonalChannel(contributorPage, trip.id);

  scenario.setValue(REMOVED_PAGE_KEY, contributorPage);
  scenario.setValue(REMOVED_CONTEXT_KEY, contributorContext);
  scenario.setValue(REMOVED_NAME_KEY, contributor.name);
});

Given("I have a co-manager with the share dialog open on my trip in their own session", async ({ page, scenario }) => {
  const trip = await scenario.ensureCurrentTrip();

  const { user: coManager } = await scenario.materialize({
    user: { overrides: { user: { name: "Revocation Co-Manager", initials: "RM" } }, setCurrent: false },
  });
  if (!coManager) throw new Error("Failed to materialize the co-manager user.");

  await withE2EDb(async (db) => {
    await db.insert(collaborators).values({
      tripId: trip.id,
      userId: coManager.id,
      email: coManager.email,
      name: coManager.name,
      initials: coManager.initials,
      role: "manager",
      isCreator: false,
    });
  });

  const coManagerContext = await page.context().browser()!.newContext();
  const coManagerPage = await coManagerContext.newPage();
  await signInAsRemovedUser(coManagerPage, coManager.email);
  await openTripWithPersonalChannel(coManagerPage, trip.id);

  await coManagerPage.getByRole("button", { name: "Share", exact: true }).click();
  await expect(coManagerPage.getByRole("heading", { name: "Share trip" })).toBeVisible();

  scenario.setValue(REMOVED_PAGE_KEY, coManagerPage);
  scenario.setValue(REMOVED_CONTEXT_KEY, coManagerContext);
  scenario.setValue(REMOVED_NAME_KEY, coManager.name);
});

When("I remove the contributor from the trip and save", async ({ page, scenario }) => {
  await removeNamedContributorAndSave(page, scenario);
});

When("I remove the co-manager from the trip and save", async ({ page, scenario }) => {
  await removeNamedContributorAndSave(page, scenario);
});

Then(
  "the contributor's session shows a message that they were removed from the trip, naming me",
  async ({ scenario }) => {
    await assertRevocationModalNamesRemover(scenario);
  }
);

Then(
  "the co-manager's session shows a message that they were removed from the trip, naming me",
  async ({ scenario }) => {
    await assertRevocationModalNamesRemover(scenario);
  }
);

Then("the co-manager's session no longer shows the share dialog", async ({ scenario }) => {
  const removedPage = getRemovedPage(scenario);
  await expect(removedPage.getByRole("heading", { name: "Share trip" })).toHaveCount(0);
});

When("the contributor's session clicks OK", async ({ scenario }) => {
  await getRemovedPage(scenario).getByRole("button", { name: "OK", exact: true }).click();
});

When("the co-manager's session clicks OK", async ({ scenario }) => {
  await getRemovedPage(scenario).getByRole("button", { name: "OK", exact: true }).click();
});

Then("the contributor's session is on the trips page", async ({ scenario }) => {
  await getRemovedPage(scenario).waitForURL("**/trips");
});

Then("the co-manager's session is on the trips page", async ({ scenario }) => {
  await getRemovedPage(scenario).waitForURL("**/trips");
});

After(async ({ scenario }) => {
  const removedContext = scenario.getValue<BrowserContext>(REMOVED_CONTEXT_KEY);
  if (removedContext) {
    await removedContext.close();
    scenario.clearValue(REMOVED_CONTEXT_KEY);
    scenario.clearValue(REMOVED_PAGE_KEY);
    scenario.clearValue(REMOVED_NAME_KEY);
  }
});
