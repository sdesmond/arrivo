import { expect } from "@playwright/test";
import { Before, When, Then } from "../fixtures";

Before({ tags: "@date-format-initial-day-month" }, async ({ scenario }) => {
  await scenario.materialize({
    user: {
      overrides: {
        user: {
          dateFormat: "DD/MM/YYYY",
        },
      },
      setCurrent: true,
    },
  });
});

When("I select the {string} date format", async ({ page }, label: string) => {
  const targetToggle = page.getByRole("button", { name: label, exact: true });
  if ((await targetToggle.getAttribute("aria-pressed")) === "true") {
    const alternateLabel = label === "Month/Day" ? "Day/Month" : "Month/Day";
    await page.getByRole("button", { name: alternateLabel, exact: true }).click();
  }
  await targetToggle.click();
});

When("I navigate to the trips page", async ({ page, scenario }) => {
  await scenario.ensureCurrentTrip();
  await page.goto("/trips");
  await expect(page).toHaveURL(/\/trips/);
  await page.waitForLoadState("domcontentloaded");
});

function toReadableDate(dateStr: string, format: "MM/DD/YYYY" | "DD/MM/YYYY"): string {
  const date = new Date(dateStr + "T00:00:00");
  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "short" });
  const year = date.getFullYear();
  return format === "MM/DD/YYYY" ? `${month} ${day}, ${year}` : `${day} ${month} ${year}`;
}

Then("the trip card dates should be in DD\\/MM\\/YYYY format", async ({ page, scenario }) => {
  const trip = scenario.currentTrip;
  if (!trip?.startDate || !trip.endDate) {
    throw new Error("Current scenario trip is missing its date range.");
  }
  const startFormatted = toReadableDate(trip.startDate, "DD/MM/YYYY");
  const endFormatted = toReadableDate(trip.endDate, "DD/MM/YYYY");
  const dateRange = page.locator('[data-testid="trip-card-date-range"]').filter({ hasText: startFormatted }).first();
  await expect(dateRange).toContainText(startFormatted);
  await expect(dateRange).toContainText(endFormatted);
});

Then("the trip card dates should be in MM\\/DD\\/YYYY format", async ({ page, scenario }) => {
  const trip = scenario.currentTrip;
  if (!trip?.startDate || !trip.endDate) {
    throw new Error("Current scenario trip is missing its date range.");
  }
  const startFormatted = toReadableDate(trip.startDate, "MM/DD/YYYY");
  const endFormatted = toReadableDate(trip.endDate, "MM/DD/YYYY");
  const dateRange = page.locator('[data-testid="trip-card-date-range"]').filter({ hasText: startFormatted }).first();
  await expect(dateRange).toContainText(startFormatted);
  await expect(dateRange).toContainText(endFormatted);
});
