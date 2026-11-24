import { expect } from "@playwright/test";
import { When, Then } from "../fixtures";
import { waitForApiResponse } from "../api-response";

When("I open the Budget tab", async ({ page }) => {
  await page.getByRole("button", { name: "Budget", exact: true }).click();
});

When("I click the Add Misc Expense button", async ({ page }) => {
  await page.getByRole("button", { name: "Add Misc Expense" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

When("I enter {string} as the expense amount", async ({ page }, amount: string) => {
  await page.getByRole("textbox", { name: "Amount" }).fill(amount);
});

When("I choose {string} as the expense currency", async ({ page }, currency: string) => {
  await page.getByRole("button", { name: /Currency:/i }).click();
  await page.getByRole("textbox", { name: "Search currencies" }).fill(currency);
  await page.getByRole("option", { name: new RegExp(`${currency}$`, "i") }).click();
});

When("I choose {string} as the expense category", async ({ page }, category: string) => {
  await page.getByRole("button", { name: "Select category" }).click();
  await page.getByRole("option", { name: category, exact: true }).click();
});

When("I save the Misc Expense", async ({ page, scenario }) => {
  const created = waitForApiResponse(page, {
    method: "POST",
    path: `/api/v1/trips/${scenario.currentTrip!.id}/expenses`,
  });
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await created;
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

Then("the Budget tab shows {string} as Actual spent", async ({ page }, amount: string) => {
  await expect(page.getByText(amount, { exact: true }).first()).toBeVisible();
});

Then("the Budget tab shows {string} as Budget", async ({ page }, amount: string) => {
  const escapedAmount = amount.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(
    page
      .locator("p")
      .filter({ hasText: new RegExp(`^Budget\\s+${escapedAmount}$`) })
      .first()
  ).toBeVisible();
});

Then("the Budget tab shows a {string} category tile", async ({ page }, category: string) => {
  await expect(page.locator('[data-slot="category-tile-grid"]').getByText(category, { exact: true })).toBeVisible();
});
