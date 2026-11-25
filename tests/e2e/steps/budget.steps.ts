import { expect, type Page } from "@playwright/test";
import { When, Then } from "../fixtures";
import { waitForApiResponse } from "../api-response";

const createdExpenseIds = new WeakMap<Page, string>();

function expensePath(page: Page): string {
  return `/api/v1/expenses/${createdExpenseIds.get(page)}`;
}

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
  const { id } = (await (await created).json()) as { id: string };
  createdExpenseIds.set(page, id);
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

When("I open the Misc Expense in the {string} category", async ({ page }, category: string) => {
  await page
    .getByRole("table", { name: "Expenses" })
    .getByRole("row", { name: new RegExp(category) })
    .click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Edit Misc Expense" })).toBeVisible();
});

When("I save the edited Misc Expense", async ({ page }) => {
  const updated = waitForApiResponse(page, { method: "PATCH", path: expensePath(page) });
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await updated;
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

When("I remove the Misc Expense", async ({ page }) => {
  const removed = waitForApiResponse(page, { method: "DELETE", path: expensePath(page) });
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await removed;
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

Then("the Budget tab shows no {string} category tile", async ({ page }, category: string) => {
  await expect(page.locator('[data-slot="category-tile-grid"]').getByText(category, { exact: true })).toHaveCount(0);
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
