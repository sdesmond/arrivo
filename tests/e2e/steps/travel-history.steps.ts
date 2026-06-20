import { expect } from "@playwright/test";
import { Given, When, Then } from "../fixtures";

Given("I have past trips in my travel history", async ({ page, scenario }) => {
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        trip: { name: "Lisbon Escape", startDate: "2025-01-01", endDate: "2025-01-03" },
        days: [
          { dayNumber: 1, date: "2025-01-01", label: "Day 1" },
          { dayNumber: 2, date: "2025-01-02", label: "Day 2" },
          { dayNumber: 3, date: "2025-01-03", label: "Day 3" },
        ],
      },
      setCurrent: false,
    },
  });
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        trip: { name: "Berlin Wrap", startDate: "2025-12-01", endDate: "2025-12-03" },
        days: [
          { dayNumber: 1, date: "2025-12-01", label: "Day 1" },
          { dayNumber: 2, date: "2025-12-02", label: "Day 2" },
          { dayNumber: 3, date: "2025-12-03", label: "Day 3" },
        ],
      },
      setCurrent: true,
    },
  });
  await scenario.signIn(page);
});

Given("I have no past trips in my travel history", async ({ page, scenario }) => {
  await scenario.ensureCurrentTrip("threeDayTrip");
  await scenario.signIn(page);
});

Given("I have a past trip available in my travel history", async ({ page, scenario }) => {
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        trip: { name: "Past Edit Trip", startDate: "2025-03-01", endDate: "2025-03-03" },
        days: [
          { dayNumber: 1, date: "2025-03-01", label: "Day 1" },
          { dayNumber: 2, date: "2025-03-02", label: "Day 2" },
          { dayNumber: 3, date: "2025-03-03", label: "Day 3" },
        ],
      },
      setCurrent: true,
    },
  });
  await scenario.signIn(page);
  await page.goto("/travel-history");
});

When("I navigate to the travel history page", async ({ page }) => {
  await page.goto("/travel-history");
});

When("I switch the travel history view to {string}", async ({ page }, mode: string) => {
  await page.getByRole("button", { name: mode, exact: true }).click();
});

Then("I see {string} in the travel history list", async ({ page }, tripName: string) => {
  await expect(page.getByText(tripName).first()).toBeVisible();
});

Then("I see the travel history empty state", async ({ page }) => {
  await expect(page.getByText("No past trips yet").first()).toBeVisible();
});

Then(
  "{string} appears before {string} in the travel history list",
  async ({ page }, firstName: string, secondName: string) => {
    const texts = await page.locator("a[href^='/trips/']").allTextContents();
    const firstIndex = texts.findIndex((text) => text.includes(firstName));
    const secondIndex = texts.findIndex((text) => text.includes(secondName));
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThanOrEqual(0);
    expect(firstIndex).toBeLessThan(secondIndex);
  }
);

Then("I do not see {string} on the trips page", async ({ page }, tripName: string) => {
  await expect(page.getByText(tripName)).toHaveCount(0);
});

Then("the trips page has no Past section", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Past" })).toHaveCount(0);
});
