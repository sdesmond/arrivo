import { expect, type Page } from "@playwright/test";
import { collaborators } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { After, Given, Then, When } from "../fixtures";
import { waitForLiveSyncResponse } from "../live-sync";

const SECOND_TAB_PAGE_KEY = "tripLiveRefreshSecondTabPage";
const CONTRIBUTOR_PAGE_KEY = "tripLiveRefreshContributorPage";
const CONTRIBUTOR_NAME_KEY = "tripLiveRefreshContributorName";

async function openFirstDay(page: Page): Promise<void> {
  const dayToggles = page.locator("button").filter({ hasText: /\d+ stops/ });
  const firstDayToggle = dayToggles.first();

  await expect(firstDayToggle).toBeVisible();

  if ((await firstDayToggle.getAttribute("aria-expanded")) === "false") {
    await firstDayToggle.click();
  }

  await expect(page.getByRole("button", { name: /add a place/i }).first()).toBeVisible();
}

async function editLastEventName(page: Page, newName: string): Promise<void> {
  const row = page.locator('[id^="event-"]').last();
  const rowId = await row.getAttribute("id");
  await row.hover();
  await row.locator("button").first().click();
  await page.locator(`#${rowId}`).getByRole("textbox").fill(newName);
  await page.keyboard.press("Enter");
}

async function openTripWithLiveSync(page: Page, tripId: string): Promise<void> {
  const liveSyncReady = waitForLiveSyncResponse(page, `/api/trips/${tripId}/events`);
  await Promise.all([page.goto(`/trips/${tripId}`), liveSyncReady]);
  await page.waitForURL(/\/trips\/.+/);
}

When("I open the trip in a second tab", async ({ page, scenario }) => {
  const trip = await scenario.ensureCurrentTrip();
  await openTripWithLiveSync(page, trip.id);
  await openFirstDay(page);

  const secondTabPage = await page.context().newPage();
  await openTripWithLiveSync(secondTabPage, trip.id);
  await openFirstDay(secondTabPage);
  scenario.setValue(SECOND_TAB_PAGE_KEY, secondTabPage);
});

When("in the second tab I edit the event name to {string}", async ({ scenario }, newName: string) => {
  const secondTabPage = scenario.getValue<Page>(SECOND_TAB_PAGE_KEY);
  if (!secondTabPage) throw new Error("No second tab is open for this scenario.");
  await editLastEventName(secondTabPage, newName);
});

Then("the trip page shows {string} without reloading", async ({ page }, name: string) => {
  await expect(page.locator('[id^="event-"]').filter({ hasText: name }).first()).toBeVisible({ timeout: 10_000 });
});

Given("I have a trip with an editor contributor viewing it in their own session", async ({ page, scenario }) => {
  const trip = await scenario.ensureCurrentTrip();

  const { user: contributor } = await scenario.materialize({
    user: { overrides: { user: { name: "Live Refresh Contributor", initials: "LR" } }, setCurrent: false },
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
  await contributorPage.goto("/sign-in");
  await contributorPage.getByRole("textbox", { name: "Email" }).fill(contributor.email);
  await contributorPage.getByRole("textbox", { name: "Password" }).fill(process.env.E2E_PASSWORD!);
  await contributorPage.getByRole("button", { name: "Sign in" }).click();
  await contributorPage.waitForURL("**/trips");

  await openTripWithLiveSync(contributorPage, trip.id);
  await expect(contributorPage.getByRole("button", { name: "Budget", exact: true })).toBeVisible();

  scenario.setValue(CONTRIBUTOR_PAGE_KEY, contributorPage);
  scenario.setValue(CONTRIBUTOR_NAME_KEY, contributor.name);
});

When("I demote the contributor to viewer and save", async ({ page, scenario }) => {
  const contributorName = scenario.getValue<string>(CONTRIBUTOR_NAME_KEY);
  if (!contributorName) throw new Error("No contributor is set up for this scenario.");

  await scenario.gotoCurrentTrip(page);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Share trip" })).toBeVisible();

  await page.getByLabel(`Role for ${contributorName}`).click();
  await page.getByRole("option", { name: "Viewer" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Contributor changes saved.")).toBeVisible();
});

Then("the contributor's open trip page no longer shows a {string} tab", async ({ scenario }, tabName: string) => {
  const contributorPage = scenario.getValue<Page>(CONTRIBUTOR_PAGE_KEY);
  if (!contributorPage) throw new Error("No contributor page is open for this scenario.");
  await expect(contributorPage.getByRole("button", { name: tabName, exact: true })).toHaveCount(0, {
    timeout: 10_000,
  });
});

Given(
  "I have a trip with a manager contributor who has the sharing dialog open in their own session",
  async ({ page, scenario }) => {
    const trip = await scenario.ensureCurrentTrip();

    const { user: contributor } = await scenario.materialize({
      user: { overrides: { user: { name: "Live Refresh Manager", initials: "LM" } }, setCurrent: false },
    });
    if (!contributor) throw new Error("Failed to materialize the manager contributor user.");

    await withE2EDb(async (db) => {
      await db.insert(collaborators).values({
        tripId: trip.id,
        userId: contributor.id,
        email: contributor.email,
        name: contributor.name,
        initials: contributor.initials,
        role: "manager",
        isCreator: false,
      });
    });

    const contributorContext = await page.context().browser()!.newContext();
    const contributorPage = await contributorContext.newPage();
    await contributorPage.goto("/sign-in");
    await contributorPage.getByRole("textbox", { name: "Email" }).fill(contributor.email);
    await contributorPage.getByRole("textbox", { name: "Password" }).fill(process.env.E2E_PASSWORD!);
    await contributorPage.getByRole("button", { name: "Sign in" }).click();
    await contributorPage.waitForURL("**/trips");

    await openTripWithLiveSync(contributorPage, trip.id);
    await contributorPage.getByRole("button", { name: "Share", exact: true }).click();
    await expect(contributorPage.getByRole("heading", { name: "Share trip" })).toBeVisible();

    scenario.setValue(CONTRIBUTOR_PAGE_KEY, contributorPage);
    scenario.setValue(CONTRIBUTOR_NAME_KEY, contributor.name);
  }
);

When("I demote the manager contributor to editor and save", async ({ page, scenario }) => {
  const contributorName = scenario.getValue<string>(CONTRIBUTOR_NAME_KEY);
  if (!contributorName) throw new Error("No contributor is set up for this scenario.");

  await scenario.gotoCurrentTrip(page);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Share trip" })).toBeVisible();

  await page.getByLabel(`Role for ${contributorName}`).click();
  await page.getByRole("option", { name: "Editor" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Contributor changes saved.")).toBeVisible();
});

Then("the contributor's open trip page no longer shows the sharing dialog", async ({ scenario }) => {
  const contributorPage = scenario.getValue<Page>(CONTRIBUTOR_PAGE_KEY);
  if (!contributorPage) throw new Error("No contributor page is open for this scenario.");
  await expect(contributorPage.getByRole("heading", { name: "Share trip" })).not.toBeVisible({ timeout: 10_000 });
});

Then("the contributor's open trip page redirects to the trips list with a deletion notice", async ({ scenario }) => {
  const contributorPage = scenario.getValue<Page>(CONTRIBUTOR_PAGE_KEY);
  if (!contributorPage) throw new Error("No contributor page is open for this scenario.");
  await contributorPage.waitForURL(/\/trips\/?$/, { timeout: 15_000 });
  await expect(contributorPage.getByText("This trip was deleted.")).toBeVisible();
});

After(async ({ scenario }) => {
  const secondTabPage = scenario.getValue<Page>(SECOND_TAB_PAGE_KEY);
  if (secondTabPage) {
    await secondTabPage.close();
    scenario.clearValue(SECOND_TAB_PAGE_KEY);
  }

  const contributorPage = scenario.getValue<Page>(CONTRIBUTOR_PAGE_KEY);
  if (contributorPage) {
    await contributorPage.context().close();
    scenario.clearValue(CONTRIBUTOR_PAGE_KEY);
  }
});
