import { expect } from "@playwright/test";
import { Then, When } from "../fixtures";

When("I open the shared trip edit sheet", async ({ page }) => {
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit Trip" })).toBeVisible();
});

Then("I see the trip Share control", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Share", exact: true })).toBeVisible();
});

Then("I do not see the trip Share control", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
});

Then("I see the trip Delete control", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Delete trip", exact: true })).toBeVisible();
});

Then("I do not see the trip Delete control", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Delete trip", exact: true })).toHaveCount(0);
});

Then("I do not see the People section", async ({ page }) => {
  await expect(page.getByText("People", { exact: true })).toHaveCount(0);
});
