import { expect } from "@playwright/test";
import { Given, When, Then } from "../fixtures";
import { ExpenseCategory } from "../../../src/data/types";

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

Given("I have trips spanning multiple destinations in my travel history", async ({ page, scenario }) => {
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        trip: {
          name: "Tokyo Trip",
          startDate: "2025-01-01",
          endDate: "2025-01-03",
          destinationCountry: "Japan",
          destinationCountryCode: "JP",
        },
        days: [
          { dayNumber: 1, date: "2025-01-01", label: "Day 1" },
          { dayNumber: 2, date: "2025-01-02", label: "Day 2" },
          { dayNumber: 3, date: "2025-01-03", label: "Day 3" },
        ],
        expenses: [
          {
            category: ExpenseCategory.Lodging,
            amount: 400,
            currency: "USD",
            date: "2025-01-01",
            convertedAmountProfile: 400,
          },
        ],
      },
      setCurrent: false,
    },
  });
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        trip: {
          name: "Paris Trip",
          startDate: "2025-02-01",
          endDate: "2025-02-03",
          destinationCountry: "France",
          destinationCountryCode: "FR",
        },
        days: [
          { dayNumber: 1, date: "2025-02-01", label: "Day 1" },
          { dayNumber: 2, date: "2025-02-02", label: "Day 2" },
          { dayNumber: 3, date: "2025-02-03", label: "Day 3" },
        ],
        expenses: [
          {
            category: ExpenseCategory.Food,
            amount: 200,
            currency: "USD",
            date: "2025-02-01",
            convertedAmountProfile: 200,
          },
        ],
      },
      setCurrent: true,
    },
  });
  await scenario.signIn(page);
});

Given("I have a trip with no destination set in my travel history", async ({ page, scenario }) => {
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        trip: { name: "No Destination Trip", startDate: "2025-03-01", endDate: "2025-03-03" },
        days: [
          { dayNumber: 1, date: "2025-03-01", label: "Day 1" },
          { dayNumber: 2, date: "2025-03-02", label: "Day 2" },
          { dayNumber: 3, date: "2025-03-03", label: "Day 3" },
        ],
        expenses: [
          {
            category: ExpenseCategory.Misc,
            amount: 75,
            currency: "USD",
            date: "2025-03-01",
            convertedAmountProfile: 75,
          },
        ],
      },
      setCurrent: true,
    },
  });
  await scenario.signIn(page);
});

Given("I have trips under, on, and over budget in my travel history", async ({ page, scenario }) => {
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        trip: { name: "Under Budget Trip", startDate: "2025-01-01", endDate: "2025-01-03", budgetTotal: 200 },
        days: [
          { dayNumber: 1, date: "2025-01-01", label: "Day 1" },
          { dayNumber: 2, date: "2025-01-02", label: "Day 2" },
          { dayNumber: 3, date: "2025-01-03", label: "Day 3" },
        ],
        expenses: [
          {
            category: ExpenseCategory.Lodging,
            amount: 100,
            currency: "USD",
            date: "2025-01-01",
            convertedAmountProfile: 100,
          },
        ],
      },
      setCurrent: false,
    },
  });
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        trip: { name: "On Budget Trip", startDate: "2025-02-01", endDate: "2025-02-03", budgetTotal: 100 },
        days: [
          { dayNumber: 1, date: "2025-02-01", label: "Day 1" },
          { dayNumber: 2, date: "2025-02-02", label: "Day 2" },
          { dayNumber: 3, date: "2025-02-03", label: "Day 3" },
        ],
        expenses: [
          {
            category: ExpenseCategory.Food,
            amount: 100,
            currency: "USD",
            date: "2025-02-01",
            convertedAmountProfile: 100,
          },
        ],
      },
      setCurrent: false,
    },
  });
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        trip: { name: "Over Budget Trip", startDate: "2025-03-01", endDate: "2025-03-03", budgetTotal: 50 },
        days: [
          { dayNumber: 1, date: "2025-03-01", label: "Day 1" },
          { dayNumber: 2, date: "2025-03-02", label: "Day 2" },
          { dayNumber: 3, date: "2025-03-03", label: "Day 3" },
        ],
        expenses: [
          {
            category: ExpenseCategory.Misc,
            amount: 100,
            currency: "USD",
            date: "2025-03-01",
            convertedAmountProfile: 100,
          },
        ],
      },
      setCurrent: true,
    },
  });
  await scenario.signIn(page);
});

Given("I have a trip with no budget set in my travel history", async ({ page, scenario }) => {
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        trip: { name: "No Budget Trip", startDate: "2025-04-01", endDate: "2025-04-03" },
        days: [
          { dayNumber: 1, date: "2025-04-01", label: "Day 1" },
          { dayNumber: 2, date: "2025-04-02", label: "Day 2" },
          { dayNumber: 3, date: "2025-04-03", label: "Day 3" },
        ],
        expenses: [
          {
            category: ExpenseCategory.Misc,
            amount: 100,
            currency: "USD",
            date: "2025-04-01",
            convertedAmountProfile: 100,
          },
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

Then("I see the destination breakdown donut", async ({ page }) => {
  await expect(page.getByRole("img", { name: /Destination breakdown donut chart/ })).toBeVisible();
});

Then("I see an {string} segment in the destination breakdown donut", async ({ page }, segmentName: string) => {
  const donut = page.getByRole("img", { name: /Destination breakdown donut chart/ });
  await expect(donut).toBeVisible();
  await expect(donut).toHaveAttribute("aria-label", new RegExp(segmentName));
});

Then("I see the budget adherence donut with {string}", async ({ page }, summary: string) => {
  const donut = page.getByRole("img", { name: /Budget adherence donut chart/ });
  await expect(donut).toBeVisible();
  await expect(donut).toHaveAttribute("aria-label", new RegExp(summary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
