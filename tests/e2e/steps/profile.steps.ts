import { expect } from "@playwright/test";
import { Given, When, Then } from "../fixtures";

Given("I am on the profile page", async ({ page, scenario }) => {
  await scenario.signIn(page);
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
  // Verify the panel actually switched (Base UI Tabs can set data-active on the
  // trigger without switching the panel under load — see profile-page-client.tsx)
  await expect(page.getByRole("tabpanel", { name: "Preferences" })).toBeVisible({ timeout: 5000 });
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
  await expect(page.locator('a[href="/profile"][aria-label="View profile"]')).toContainText(name);
});

When("I set currency to {string}", async ({ page }, currency: string) => {
  await page.getByRole("button", { name: /Currency:/i }).click();
  await page.getByRole("textbox", { name: "Search currencies" }).fill(currency);
  await page.getByRole("option", { name: new RegExp(`${currency}$`, "i") }).click();
});

When("I save the Preferences section", async ({ page }) => {
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Saving…" })).toBeVisible({ timeout: 3000 });
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 10000 });
});

Then("the currency preference should persist after reload", async ({ page }) => {
  await page.reload();
  await page.getByRole("tab", { name: "Preferences" }).click();
  await expect(page.getByRole("button", { name: /Currency: Euro EUR/i })).toBeVisible();
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

When("I navigate to the Appearance section", async ({ page }) => {
  await page.getByRole("tab", { name: "Appearance" }).click();
});

When("I select {string} as the font size", async ({ page }, size: string) => {
  await page.getByRole("combobox", { name: /font size/i }).click();
  await page.getByRole("option", { name: size }).click();
});

Then("the font size select should show {string}", async ({ page }, size: string) => {
  await expect(page.getByRole("combobox", { name: /font size/i })).toContainText(size, { ignoreCase: true });
});

When("I reload the page", async ({ page }) => {
  await page.reload();
});

When("I type in the name field", async ({ page }) => {
  const nameInput = page.locator("#profile-name");
  await nameInput.fill("Dirty Name");
});

When("I accept the unsaved-changes dialog when switching to the Preferences section", async ({ page }) => {
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("tab", { name: "Preferences" }).click();
});

Then("I should be on the Preferences section", async ({ page }) => {
  await expect(page.getByRole("tab", { name: "Preferences" })).toHaveAttribute("aria-selected", "true");
});

When("I accept the unsaved-changes dialog when switching to the Traveler section", async ({ page }) => {
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("tab", { name: "Traveler" }).click();
});

Then("switching to the Traveler section should not show a warning", async ({ page }) => {
  let dialogFired = false;
  page.once("dialog", () => {
    dialogFired = true;
  });
  await page.getByRole("tab", { name: "Traveler" }).click();
  await expect(page.getByText("Loyalty Numbers")).toBeVisible();
  expect(dialogFired).toBe(false);
});

Then("I should see the loyalty number {string}", async ({ page }, memberNumber: string) => {
  await expect(page.getByText(memberNumber)).toBeVisible();
});

When("I click the copy button for the loyalty number", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy member number" }).click();
});

Then("the copy button should show the copied state", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();
});

When("I navigate to the Companions section", async ({ page }) => {
  await page.getByRole("tab", { name: "Companions" }).click();
});

Then("I should see the companion {string}", async ({ page }, name: string) => {
  await expect(page.getByText(name)).toBeVisible();
});

When("I add a companion named {string}", async ({ page }, name: string) => {
  await page.locator("#companion-name").fill(name);
  await page.getByRole("button", { name: "Add" }).click();
  await page.waitForTimeout(500);
});

When("I remove the companion {string}", async ({ page }, name: string) => {
  await page.getByRole("button", { name: `Remove ${name}` }).click();
  await page.waitForTimeout(500);
});

Then("the companion {string} should not be visible", async ({ page }, name: string) => {
  await expect(page.getByText(name)).not.toBeVisible();
});
