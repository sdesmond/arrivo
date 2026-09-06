import { expect, type BrowserContext, type Page } from "@playwright/test";
import { collaborators } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { After, Given, Then, When } from "../fixtures";
import { waitForLiveSyncResponse } from "../live-sync";
import type { ScenarioFixtureContext } from "../scenario-fixture";

const CONTRIBUTOR_CONTEXT_KEY = "dashboardLiveSyncContributorContext";
const CONTRIBUTOR_PAGE_KEY = "dashboardLiveSyncContributorPage";
const CONTRIBUTOR_NAME_KEY = "dashboardLiveSyncContributorName";

function getContributorPage(scenario: ScenarioFixtureContext): Page {
  const contributorPage = scenario.getValue<Page>(CONTRIBUTOR_PAGE_KEY);
  if (!contributorPage) throw new Error("No dashboard contributor page is open for this scenario.");
  return contributorPage;
}

async function openShareDialog(page: Page, scenario: ScenarioFixtureContext): Promise<void> {
  await scenario.gotoCurrentTrip(page);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Share trip" })).toBeVisible();
}

async function signInOnDashboard(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(process.env.E2E_PASSWORD!);
  const personalChannelReady = waitForLiveSyncResponse(page, "/api/users/me/events");
  await page.getByRole("button", { name: "Sign in" }).click();
  await Promise.all([page.waitForURL("**/trips"), personalChannelReady]);
}

Given("I have an editor contributor viewing the dashboard in their own session", async ({ page, scenario }) => {
  const trip = await scenario.ensureCurrentTrip();
  const { user: contributor } = await scenario.materialize({
    user: { overrides: { user: { name: "Dashboard Live Contributor", initials: "DL" } }, setCurrent: false },
  });
  if (!contributor) throw new Error("Failed to materialize the dashboard contributor user.");

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

  const browser = page.context().browser();
  if (!browser) throw new Error("No browser is available to open the contributor session.");
  const contributorContext = await browser.newContext();
  scenario.setValue(CONTRIBUTOR_CONTEXT_KEY, contributorContext);
  const contributorPage = await contributorContext.newPage();
  scenario.setValue(CONTRIBUTOR_PAGE_KEY, contributorPage);
  scenario.setValue(CONTRIBUTOR_NAME_KEY, contributor.name);

  await signInOnDashboard(contributorPage, contributor.email);
  const tripCard = contributorPage.locator(`a[href="/trips/${trip.id}"]`).filter({ hasText: trip.name }).first();
  await expect(tripCard).toBeVisible();
  await tripCard.getByTitle("Trip options").click();
  await expect(contributorPage.getByRole("menuitem", { name: "Edit trip" })).toBeVisible();
  await contributorPage.keyboard.press("Escape");
});

When("I demote the dashboard contributor to viewer and save", async ({ page, scenario }) => {
  const contributorName = scenario.getValue<string>(CONTRIBUTOR_NAME_KEY);
  if (!contributorName) throw new Error("No dashboard contributor is set up for this scenario.");

  await openShareDialog(page, scenario);
  await page.getByLabel(`Role for ${contributorName}`).click();
  await page.getByRole("option", { name: "Viewer" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Contributor changes saved.")).toBeVisible();
});

Then("the contributor's dashboard no longer offers Edit trip without reloading", async ({ scenario }) => {
  const contributorPage = getContributorPage(scenario);
  const trip = await scenario.ensureCurrentTrip();
  const tripCard = contributorPage.locator(`a[href="/trips/${trip.id}"]`).filter({ hasText: trip.name }).first();

  await expect(async () => {
    await tripCard.getByTitle("Trip options").click();
    try {
      // Wait for the menu itself before asserting the item is gone. `toHaveCount(0)` is satisfied
      // the instant the DOM has no such node — including before the dropdown portal mounts — so
      // asserting it straight after the click passes on the first attempt whether or not the
      // demotion ever reached this tab. A demoted viewer's menu has no items at all, so the open
      // popup is the only thing that proves the menu actually rendered.
      await expect(contributorPage.getByRole("menu")).toBeVisible();
      await expect(contributorPage.getByRole("menuitem", { name: "Edit trip" })).toHaveCount(0);
    } finally {
      await contributorPage.keyboard.press("Escape");
    }
  }).toPass({ timeout: 15_000 });
});

When("I remove the dashboard contributor from the trip and save", async ({ page, scenario }) => {
  const contributorName = scenario.getValue<string>(CONTRIBUTOR_NAME_KEY);
  if (!contributorName) throw new Error("No dashboard contributor is set up for this scenario.");

  await openShareDialog(page, scenario);
  await page.getByTitle(`Remove ${contributorName}`).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Contributor changes saved.")).toBeVisible();
});

Then("the dashboard contributor sees a message that they were removed from the trip", async ({ scenario }) => {
  const contributorPage = getContributorPage(scenario);
  const trip = await scenario.ensureCurrentTrip();
  const modal = contributorPage.getByRole("alertdialog");

  await expect(modal).toBeVisible({ timeout: 15_000 });
  await expect(modal.getByText(trip.name, { exact: false })).toBeVisible();
});

When("the dashboard contributor clicks OK", async ({ scenario }) => {
  await getContributorPage(scenario).getByRole("button", { name: "OK", exact: true }).click();
});

Then("the removed trip is absent from the contributor's dashboard", async ({ scenario }) => {
  const contributorPage = getContributorPage(scenario);
  const trip = await scenario.ensureCurrentTrip();
  await expect(contributorPage.locator(`a[href="/trips/${trip.id}"]`)).toHaveCount(0, { timeout: 15_000 });
});

After(async ({ scenario }) => {
  const contributorContext = scenario.getValue<BrowserContext>(CONTRIBUTOR_CONTEXT_KEY);
  if (contributorContext) {
    await contributorContext.close();
    scenario.clearValue(CONTRIBUTOR_CONTEXT_KEY);
    scenario.clearValue(CONTRIBUTOR_PAGE_KEY);
    scenario.clearValue(CONTRIBUTOR_NAME_KEY);
  }
});
