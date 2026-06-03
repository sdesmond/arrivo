import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { packingItems } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { Given, Then, When } from "../fixtures";

async function seedSaveAsTemplateItems(tripId: string): Promise<void> {
  await withE2EDb(async (db) => {
    await db.delete(packingItems).where(eq(packingItems.tripId, tripId));
    await db.insert(packingItems).values([
      { tripId, name: "Passport", isLabel: false, done: false, position: 0, labelId: null },
      { tripId, name: "Toothbrush", isLabel: false, done: true, position: 1, labelId: null },
    ]);
  });
}

Given("I am signed in as the save-template user", async ({ page, scenario }) => {
  await scenario.signIn(page);
});

Given("I have a trip with packing items for save-as-template", async ({ scenario }) => {
  const trip = await scenario.ensureCurrentTrip("threeDayTrip", {
    trip: {
      name: "E2E Save Template Trip",
      startDate: "2026-07-11",
      endDate: "2026-07-13",
    },
  });
  await seedSaveAsTemplateItems(trip.id);
});

When("I open the packing tab for the save-template trip", async ({ page, scenario }) => {
  await scenario.gotoCurrentTrip(page);
  await page.getByRole("button", { name: "Packing" }).click();
  await expect(page.getByRole("button", { name: "Add item", exact: true })).toBeVisible({ timeout: 10_000 });
});

When("I save the packing list as template named {string}", async ({ page }, name: string) => {
  await page.getByRole("button", { name: "Save as template" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await dialog.getByLabel("Template name").fill(name);
  await dialog.getByRole("button", { name: "Save template" }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
});

When("I open the save-as-template dialog", async ({ page }) => {
  await page.getByRole("button", { name: "Save as template" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
});

When("I submit the save dialog without a name", async () => {
  // The save button is disabled when name is empty — this step verifies that state.
  // There is nothing more to do; the assertion step checks the button is disabled.
});

Then("I should see the save-template success feedback", async ({ page }) => {
  await expect(page.getByText("Template saved")).toBeVisible({ timeout: 10_000 });
});

Then("the template library should contain {string}", async ({ page }, name: string) => {
  await page.goto("/packing");
  await expect(page.getByRole("heading", { name: "Packing Templates" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
});

Then("I should see the template name validation error", async ({ page }) => {
  const dialog = page.getByRole("dialog");
  const saveBtn = dialog.getByRole("button", { name: "Save template" });
  await expect(saveBtn).toBeDisabled();
});

Then("the packing tab still shows {string}", async ({ page }, name: string) => {
  await expect(page.locator("[data-packing-kind]").filter({ hasText: name }).first()).toBeVisible({ timeout: 5_000 });
});

Then("the saved template should have no checked items", async ({ page }) => {
  await page.goto("/packing");
  await expect(page.getByRole("heading", { name: "Packing Templates" })).toBeVisible({ timeout: 10_000 });
  const templateLink = page.getByRole("link", { name: /Checked Test/ });
  await templateLink.click();
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(0, { timeout: 10_000 });
});
