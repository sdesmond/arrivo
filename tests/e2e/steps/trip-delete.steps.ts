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
  await tripCard.getByTitle("Trip options").click();
});

When("I choose {string} from the trip options menu", async ({ page }, action: string) => {
  await page.getByRole("menuitem", { name: action }).click();
});

When("I confirm the trip deletion", async ({ page }) => {
  await page.getByRole("button", { name: "Delete", exact: true }).click();
});

Then("the trip {string} is no longer visible in the trip list", async ({ page }, tripName: string) => {
  await expect(page.locator("a[href^='/trips/']").filter({ hasText: tripName })).toHaveCount(0);
});
