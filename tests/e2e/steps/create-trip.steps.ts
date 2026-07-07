import { expect, type Page } from "@playwright/test";
import { When, Then } from "../fixtures";
import {
  E2E_TRIP_ALT_START_DATE,
  E2E_TRIP_ALT_THIRD_DATE,
  E2E_TRIP_START_DATE,
  E2E_TRIP_THIRD_DATE,
} from "../e2e-seed-data";

async function clickDate(page: Page, isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  const dataDay = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  const dateButton = page.locator(`button[data-day="${dataDay}"]`).first();

  for (let attempt = 0; attempt < 12; attempt++) {
    if ((await dateButton.count()) > 0 && (await dateButton.isVisible())) {
      await dateButton.click();
      return;
    }
    await page.locator(".rdp-button_next").click();
  }

  throw new Error(`Could not find calendar date ${isoDate}`);
}

function formatRangeLabel(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDayTogglePattern(isoDate: string): RegExp {
  const date = new Date(`${isoDate}T12:00:00Z`);
  const month = date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const day = date.getUTCDate();
  return new RegExp(`Day 1|${month}\\s*${day}|${day}\\s*${month}`, "i");
}

async function selectDateRange(page: Page, startDate: string, endDate: string): Promise<void> {
  await page.getByRole("button", { name: /optional date range/i }).click();
  await clickDate(page, startDate);
  await clickDate(page, endDate);
  await expect(
    page.getByRole("button", {
      name: `${formatRangeLabel(startDate)} – ${formatRangeLabel(endDate)}`,
    })
  ).toBeVisible();
}

When("I open the New Trip dialog", async ({ page }) => {
  await page.getByRole("button", { name: "New trip", exact: true }).click();
});

When("I type {string} in the title field", async ({ page }, title: string) => {
  await page.getByRole("dialog").getByLabel("Title").fill(title);
});

When("I type {string} in the destination field", async ({ page }, destination: string) => {
  // searchLocations and retrieveLocation are server actions — Mapbox API calls happen server-side.
  // E2E_MAPBOX_STUB=true (set in the E2E environment) makes both actions return deterministic stubs
  // without making real API calls. No browser-level route mocking is needed.
  await page.getByRole("dialog").getByLabel("Destination").fill(destination);
});

When("I select dates {string} to {string}", async ({ page }, startDate: string, endDate: string) => {
  await selectDateRange(page, startDate, endDate);
});

When("I select the default future trip dates", async ({ page }) => {
  await selectDateRange(page, E2E_TRIP_START_DATE, E2E_TRIP_THIRD_DATE);
});

When("I select the alternate future trip dates", async ({ page }) => {
  await selectDateRange(page, E2E_TRIP_ALT_START_DATE, E2E_TRIP_ALT_THIRD_DATE);
});

When("I click the Create button", async ({ page }) => {
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("/trips"),
    { timeout: 15_000 }
  );

  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Create$/ })
    .click();

  const response = await responsePromise;
  if (!response.ok()) {
    const body = (await response.text()).slice(0, 1500);
    throw new Error(`Create trip action failed with ${response.status()}: ${body}`);
  }
});

Then("I am on the trip detail page for {string}", async ({ page, scenario }, title: string) => {
  await expect(page).toHaveURL(/\/trips\/[^/?]+(\?new=1)?$/, { timeout: 15_000 });
  await scenario.rememberTripByName(title);
  await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 15_000 });
});

Then("Day 1 is expanded", async ({ page }) => {
  const dayOneToggle = page
    .locator("button[aria-expanded]")
    .filter({ hasText: formatDayTogglePattern(E2E_TRIP_START_DATE) })
    .first();
  await expect(dayOneToggle).toBeVisible({ timeout: 10_000 });
  await expect(dayOneToggle).toHaveAttribute("aria-expanded", "true");
});

Then("the day cards have the stagger animation class", async ({ page }) => {
  const animatedCard = page.locator('[data-testid^="day-card-stagger"]').first();
  await expect(animatedCard).toBeVisible({ timeout: 10_000 });
});

Then("the Create button is not clickable during submission", async ({ page }) => {
  await expect(page.getByRole("dialog").getByRole("button", { name: /creating/i })).toBeDisabled({ timeout: 1000 });
});

Then("the destination suggestions appear", async ({ page }) => {
  await expect(page.getByRole("listbox")).toBeVisible();
});

When("I select the first destination suggestion", async ({ page }) => {
  await page.getByRole("option").first().click();
});

Then("the destination field shows the selected place name", async ({ page }) => {
  await expect(page.getByRole("dialog").getByLabel("Destination")).toHaveValue("Paris, France");
});
