import { expect } from "@playwright/test";
import { Given, When, Then } from "../fixtures";

Given("I have a trip available to delete from the listing page", async ({ page, scenario }) => {
  await scenario.ensureCurrentTrip("deleteTrip");
  await scenario.signIn(page);
  await page.goto("/trips");
  await expect(page.locator("a[href^='/trips/']").filter({ hasText: "E2E Delete Trip" }).first()).toBeVisible();
});

When("I open the trip options menu for {string}", async ({ page }, tripName: string) => {
  const tripCard = page.locator("a[href^='/trips/']").filter({ hasText: tripName }).first();
  await expect(tripCard).toBeVisible();
  const trigger = tripCard.getByTitle("Trip options");
  await trigger.click();
  const deleteTripItem = page.getByRole("menuitem", { name: "Delete trip" });
  if (!(await deleteTripItem.isVisible().catch(() => false))) {
    await trigger.focus();
    await page.keyboard.press("Enter");
  }
  await expect(deleteTripItem).toBeVisible();
});

When("I choose {string} from the trip options menu", async ({ page }, action: string) => {
  const menuItem = page.getByRole("menuitem", { name: action }).first();
  await expect(menuItem).toBeVisible();
  await menuItem.focus();
  await page.keyboard.press("Enter");
});

When("I confirm the trip deletion", async ({ page }) => {
  await page.getByRole("button", { name: "Delete", exact: true }).click();
});

Then("the trip {string} is no longer visible in the trip list", async ({ page }, tripName: string) => {
  await expect(page.locator("a[href^='/trips/']").filter({ hasText: tripName })).toHaveCount(0);
});
