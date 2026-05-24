import { expect } from "@playwright/test";
import { When, Then } from "../fixtures";

When("I click the New trip button in the topbar", async ({ page }) => {
  await page.getByRole("button", { name: "New trip", exact: true }).click();
});

When("I click the Cancel button in the New Trip dialog", async ({ page }) => {
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
});

Then("the New Trip dialog is visible", async ({ page }) => {
  await expect(page.getByRole("dialog", { name: "New Trip" })).toBeVisible();
});

Then("the New Trip dialog is not visible", async ({ page }) => {
  await expect(page.getByRole("dialog", { name: "New Trip" })).not.toBeVisible();
});

Then("the title field is focused", async ({ page }) => {
  const titleInput = page.getByRole("dialog").getByLabel("Title");
  await expect(titleInput).toBeFocused();
});
