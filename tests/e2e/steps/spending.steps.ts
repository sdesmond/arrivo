import { expect } from "@playwright/test";
import { Given, When, Then } from "../fixtures";
import { ExpenseCategory } from "../../src/data/types";

Given("I have a past trip with categorized expenses in my travel history", async ({ page, scenario }) => {
  const startDate = "2025-01-01";
  const day2 = "2025-01-02";
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        trip: { name: "Category Spend Trip", startDate, endDate: "2025-01-03" },
        days: [
          { dayNumber: 1, date: startDate, label: "Day 1" },
          { dayNumber: 2, date: day2, label: "Day 2" },
          { dayNumber: 3, date: "2025-01-03", label: "Day 3" },
        ],
        expenses: [
          {
            category: ExpenseCategory.Lodging,
            amount: 600,
            currency: "USD",
            date: startDate,
            convertedAmountProfile: 600,
          },
          { category: ExpenseCategory.Food, amount: 150, currency: "USD", date: day2, convertedAmountProfile: 150 },
        ],
      },
      setCurrent: true,
    },
  });
  await scenario.signIn(page);
});

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

Then("I see the category breakdown donut", async ({ page }) => {
  await expect(page.getByRole("img", { name: /Category breakdown donut chart/ })).toBeVisible();
});

Then("I do not see the category breakdown donut", async ({ page }) => {
  await expect(page.getByRole("img", { name: /Category breakdown donut chart/ })).toHaveCount(0);
});
