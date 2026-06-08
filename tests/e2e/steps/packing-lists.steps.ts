import { expect, type Page } from "@playwright/test";
import { packingTemplateItems, packingTemplates, tripPackingLists } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { Given, When, Then } from "../fixtures";

async function reloadTrip(page: Page): Promise<void> {
  await page.goto(page.url());
  await page.waitForURL(/\/trips/);
}

Given("I have a seeded packing list named {string}", async ({ page, scenario }, name: string) => {
  const trip = scenario.currentTrip;
  if (!trip) throw new Error("No current trip in scenario");
  await withE2EDb(async (db) => {
    await db.insert(tripPackingLists).values({ tripId: trip.id, name, position: 0 }).onConflictDoNothing();
  });
  await reloadTrip(page);
});

Given("I have a seeded packing template named {string} with items", async ({ page, scenario }, name: string) => {
  const user = scenario.currentUser;
  if (!user) throw new Error("No current user in scenario");
  await withE2EDb(async (db) => {
    const [template] = await db
      .insert(packingTemplates)
      .values({ userId: user.id, name })
      .returning({ id: packingTemplates.id });
    if (!template) throw new Error("Failed to create template");
    await db.insert(packingTemplateItems).values([
      { templateId: template.id, text: "Sunscreen", isLabel: false, position: 0, labelId: null },
      { templateId: template.id, text: "Towel", isLabel: false, position: 1, labelId: null },
    ]);
  });
  await reloadTrip(page);
});

Then("I should see the packing lists empty state", async ({ page }) => {
  await expect(page.getByText("No packing lists yet")).toBeVisible({ timeout: 10_000 });
});

When("I create a new packing list named {string}", async ({ page }, name: string) => {
  await page.getByRole("button", { name: "New List" }).click();
  await page.getByLabel("Packing list name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  // List name appears either in drill-down heading or library card
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });
  // Return to library if currently in drill-down
  const allListsBtn = page.getByRole("button", { name: "All lists" });
  if (await allListsBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await allListsBtn.click();
  }
  await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
});

Then("the packing list library should show {string}", async ({ page }, name: string) => {
  await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
});

When("I open the packing list {string}", async ({ page }, name: string) => {
  const openButton = page.getByRole("button", { name: `Open "${name}"` });
  if (await openButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await openButton.click();
  } else {
    await page.getByText(name, { exact: true }).first().click();
  }
  await expect(page.getByRole("button", { name: "All lists" })).toBeVisible({ timeout: 10_000 });
});

When("I open day 1 in the itinerary", async ({ page }) => {
  await page.getByRole("button", { name: "Itinerary" }).click();
  const dayToggle = page
    .locator("button")
    .filter({ hasText: /\d+ stops/ })
    .first();
  await expect(dayToggle).toBeVisible({ timeout: 10_000 });
  const expanded = await dayToggle.getAttribute("aria-expanded");
  if (expanded === "false") await dayToggle.click();
  await expect(page.getByRole("button", { name: /Add a place to day/i })).toBeVisible({ timeout: 10_000 });
});

When("I click Add and select the packing list picker", async ({ page }) => {
  await page.getByRole("button", { name: /Add a place to day 1/i }).click();
  await page.getByTitle("Insert packing list").click();
  await expect(page.getByText("Insert packing list").first()).toBeVisible({ timeout: 10_000 });
});

When("I select the template {string} from the picker", async ({ page }, name: string) => {
  // Template rows in the picker dialog are buttons
  await page.getByText(name, { exact: true }).first().click();
});

Then("a checklist titled {string} should appear in day 1", async ({ page }, title: string) => {
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 });
});
