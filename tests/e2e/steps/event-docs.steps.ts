import { expect } from "@playwright/test";
import { Given, When, Then } from "../fixtures";

Given("I am on the Itinerary tab", async ({ page }) => {
  await page.getByRole("button", { name: "Itinerary" }).click();
  await page.waitForTimeout(500);
});

Given("I expand Day 1", async ({ page }) => {
  // Day 1 is 2026-07-01; header shows "Wed, Jul 1" (MM/DD) or "Wed, 1 Jul" (DD/MM)
  const toggleBtn = page.getByRole("button", { name: /wed.*(jul\s*1|1\s*jul)/i }).first();
  await toggleBtn.click();
  await expect(page.getByText("E2E Event")).toBeVisible({ timeout: 5_000 });
});

When("I click the Attach button on {string}", async ({ page }, eventName: string) => {
  // Locate the specific event's Attach button via the action bar sibling of the event name
  await page
    .locator("div")
    .filter({ hasText: new RegExp(eventName) })
    .filter({ has: page.getByTitle("Attach document") })
    .getByTitle("Attach document")
    .first()
    .click();
});

Then("the pick list panel shows {string}", async ({ page }, docName: string) => {
  await expect(page.getByRole("button", { name: docName })).toBeVisible({ timeout: 5_000 });
});

When("I select {string} from the pick list", async ({ page }, docName: string) => {
  await page.getByRole("button", { name: docName }).click();
});

Then("the AddDocDialog is closed", async ({ page }) => {
  await expect(page.getByText("Attach document")).not.toBeVisible({ timeout: 5_000 });
});

When("I click {string}", async ({ page }, buttonText: string) => {
  await page.getByRole("button", { name: buttonText }).click();
});

Then("the upload panel is shown with the Attach button", async ({ page }) => {
  await expect(page.getByRole("button", { name: /^attach$/i })).toBeVisible({ timeout: 5_000 });
});
