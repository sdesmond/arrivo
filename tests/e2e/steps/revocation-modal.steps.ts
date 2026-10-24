import { expect, type BrowserContext, type Page } from "@playwright/test";
import { After, Given, Then, When } from "../fixtures";
import type { ScenarioFixtureContext, ScenarioUserRecord } from "../scenario-fixture";
import { waitForLiveSyncResponse } from "../live-sync";

const REMOVED_PAGE_KEY = "revocationModalRemovedPage";
const REMOVED_CONTEXT_KEY = "revocationModalRemovedContext";
const REMOVED_NAME_KEY = "revocationModalRemovedName";
const STAGED_TARGET_NAME_KEY = "revocationModalStagedTargetName";

async function openTripWithPersonalChannel(page: Page, tripId: string): Promise<void> {
  const personalChannelReady = waitForLiveSyncResponse(page, "/api/users/me/events");
  await Promise.all([page.goto(`/trips/${tripId}`), personalChannelReady]);
  await page.waitForURL(/\/trips\/.+/);
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

function revocationModal(page: Page) {
  return page.getByRole("alertdialog");
}

async function assertRevocationModalNamesRemover(scenario: ScenarioFixtureContext): Promise<void> {
  const removedPage = getRemovedPage(scenario);
  const trip = await scenario.ensureCurrentTrip();
  const remover = scenario.currentUser;
  if (!remover) throw new Error("No current user is set for this scenario, so there is no remover to name.");

  // Scoped to the dialog: the trip page underneath renders the trip name in its hero and the
  // remover's name in the contributor rail, so an unscoped getByText would pass without the modal.
  const modal = revocationModal(removedPage);
  await expect(modal).toBeVisible({ timeout: 15_000 });
  await expect(modal.getByText(trip.name, { exact: false })).toBeVisible();
  await expect(modal.getByText(remover.name, { exact: false })).toBeVisible();
  await expect(modal.getByRole("button", { name: "OK", exact: true })).toBeVisible();
}

/**
 * Opens a second browser session on the trip as `contributor`. The context is registered with the
 * scenario immediately after creation — before sign-in or navigation can throw — so the After hook
 * always has something to close and a failed setup cannot leak a context into the rest of the run.
 */
async function openSecondSessionOnTrip(
  page: Page,
  scenario: ScenarioFixtureContext,
  contributor: ScenarioUserRecord,
  tripId: string
): Promise<Page> {
  const { context, page: secondPage } = await scenario.openSecondSession(page);
  scenario.setValue(REMOVED_CONTEXT_KEY, context);
  scenario.setValue(REMOVED_PAGE_KEY, secondPage);
  scenario.setValue(REMOVED_NAME_KEY, contributor.name);

  await scenario.signInAsUser(secondPage, contributor.username);
  await openTripWithPersonalChannel(secondPage, tripId);
  return secondPage;
}

Given("I have a contributor viewing my trip in their own session", async ({ page, scenario }) => {
  const trip = await scenario.ensureCurrentTrip();
  const contributor = await scenario.seedCollaborator(trip.id, "Revocation Contributor", "RC", "editor");
  await openSecondSessionOnTrip(page, scenario, contributor, trip.id);
});

Given("I have a co-manager with a staged contributor removal in their own session", async ({ page, scenario }) => {
  const trip = await scenario.ensureCurrentTrip();
  const coManager = await scenario.seedCollaborator(trip.id, "Revocation Co-Manager", "RM", "manager");
  const bystander = await scenario.seedCollaborator(trip.id, "Revocation Bystander", "RB", "editor");
  scenario.setValue(STAGED_TARGET_NAME_KEY, bystander.name);

  const coManagerPage = await openSecondSessionOnTrip(page, scenario, coManager, trip.id);

  await coManagerPage.getByRole("button", { name: "Share", exact: true }).click();
  await expect(coManagerPage.getByRole("heading", { name: "Share trip" })).toBeVisible();

  // Stage a removal without saving — this is the work AC3 requires to be discarded.
  await coManagerPage.getByTitle(`Remove ${bystander.name}`).click();
  await expect(coManagerPage.getByText("Will be removed on Save")).toBeVisible();
});

When("I remove the {string} from the trip and save", async ({ page, scenario }) => {
  await removeNamedContributorAndSave(page, scenario);
});

Then("the {string} session shows a message that they were removed from the trip, naming me", async ({ scenario }) => {
  await assertRevocationModalNamesRemover(scenario);
});

Then("the co-manager's session no longer shows the share dialog", async ({ scenario }) => {
  const removedPage = getRemovedPage(scenario);
  await expect(removedPage.getByRole("heading", { name: "Share trip" })).toHaveCount(0);
});

Then("the removal message cannot be dismissed", async ({ scenario }) => {
  const removedPage = getRemovedPage(scenario);
  const modal = revocationModal(removedPage);

  await removedPage.keyboard.press("Escape");
  await expect(modal).toBeVisible();

  // Click the far top-left corner — outside the centred popup, on the backdrop.
  await removedPage.mouse.click(4, 4);
  await expect(modal).toBeVisible();
});

Then("the staged removal was discarded", async ({ page, scenario }) => {
  const stagedTargetName = scenario.getValue<string>(STAGED_TARGET_NAME_KEY);
  if (!stagedTargetName) throw new Error("No staged removal target is set up for this scenario.");

  // The co-manager's staged removal must never have reached the server. Verified from the owner's
  // session, since the co-manager has lost access to the trip by this point.
  await scenario.gotoCurrentTrip(page);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Share trip" })).toBeVisible();
  await expect(page.getByTitle(`Remove ${stagedTargetName}`)).toBeVisible();
});

When("the {string} session clicks OK", async ({ scenario }) => {
  await getRemovedPage(scenario).getByRole("button", { name: "OK", exact: true }).click();
});

Then("the {string} session is on the trips page", async ({ scenario }) => {
  await getRemovedPage(scenario).waitForURL("**/trips");
});

After(async ({ scenario }) => {
  const removedContext = scenario.getValue<BrowserContext>(REMOVED_CONTEXT_KEY);
  if (removedContext) {
    await removedContext.close();
    scenario.clearValue(REMOVED_CONTEXT_KEY);
    scenario.clearValue(REMOVED_PAGE_KEY);
    scenario.clearValue(REMOVED_NAME_KEY);
    scenario.clearValue(STAGED_TARGET_NAME_KEY);
  }
});
