import { expect } from "@playwright/test";
import { Given, When, Then } from "../fixtures";

Given("I am on the profile page", async ({ page }) => {
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/profile/);
});

When("I click the user area in the sidebar", async ({ page }) => {
  await page.click('a[href="/profile"][aria-label="View profile"]');
});

Then("I should be on the profile page", async ({ page }) => {
  await expect(page).toHaveURL(/\/profile/);
});

When("I navigate to the Identity section", async ({ page }) => {
  await page.getByRole("tab", { name: "Identity" }).click();
});

When("I navigate to the Traveler section", async ({ page }) => {
  await page.getByRole("tab", { name: "Traveler" }).click();
});

When("I navigate to the Preferences section", async ({ page }) => {
  await page.getByRole("tab", { name: "Preferences" }).click();
});

When("I update my name to {string}", async ({ page }, name: string) => {
  const nameInput = page.locator("#profile-name");
  await nameInput.clear();
  await nameInput.fill(name);
});

When("I save the Identity section", async ({ page }) => {
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForTimeout(500);
});

Then("my name {string} should appear in the sidebar", async ({ page }, name: string) => {
  await expect(page.locator('a[href="/profile"]')).toContainText(name);
});

When("I set currency to {string}", async ({ page }, currency: string) => {
  const currencyInput = page.locator("#pref-currency");
  await currencyInput.clear();
  await currencyInput.fill(currency);
});

When("I save the Preferences section", async ({ page }) => {
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForTimeout(500);
});

Then("the currency preference should persist after reload", async ({ page }) => {
  await page.reload();
  await page.getByRole("tab", { name: "Preferences" }).click();
  await expect(page.locator("#pref-currency")).toHaveValue("EUR");
});

Then("the Identity section should be active", async ({ page }) => {
  await expect(page.getByRole("tab", { name: "Identity" })).toHaveAttribute("aria-selected", "true");
});

Then("the Identity content should be visible", async ({ page }) => {
  await expect(page.locator("#profile-name")).toBeVisible();
});

Then("the Traveler content should be visible", async ({ page }) => {
  await expect(page.getByText("Loyalty Numbers")).toBeVisible();
});

Then("the Identity content should not be visible", async ({ page }) => {
  await expect(page.locator("#profile-name")).not.toBeVisible();
});
