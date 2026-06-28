import { expect } from "@playwright/test";
import { When, Then } from "../fixtures";

When("I switch to the {string} view", async ({ page }, viewLabel: string) => {
  await page.getByRole("button", { name: viewLabel, exact: true }).click();
});

When("I change the spending date range to {string}", async ({ page }, rangeLabel: string) => {
  await page.getByRole("button", { name: "Date Range" }).click();
  await page.getByRole("option", { name: rangeLabel, exact: true }).click();
});

Then("I see the spending headline figures", async ({ page }) => {
  await expect(page.getByText("Total Spend")).toBeVisible();
  await expect(page.getByText("Average Trip Spend")).toBeVisible();
  await expect(page.getByText("Average Daily Spend")).toBeVisible();
});

Then("I see the spending empty state", async ({ page }) => {
  await expect(
    page.getByText("Add costs to your trips (reservations, events, misc) and track them over time here.")
  ).toBeVisible();
});

Then("I see {string}", async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});

Then("I do not see {string}", async ({ page }, text: string) => {
  await expect(page.getByText(text)).toHaveCount(0);
});

Then("the spending live region announces {string}", async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});
