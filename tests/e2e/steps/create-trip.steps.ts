import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { inArray } from "drizzle-orm";
import { trips } from "../../../src/db/schema";
import { When, Then, After } from "../fixtures";

const CREATED_TRIP_NAMES = ["E2E Date Trip", "E2E Animated Trip", "E2E Dateless Trip", "E2E Pending Trip"];

async function withE2EDb<T>(fn: (db: ReturnType<typeof drizzle>) => Promise<T>): Promise<T> {
  const client = postgres(process.env.E2E_DATABASE_URL!);
  const db = drizzle(client);
  try {
    return await fn(db);
  } finally {
    await client.end();
  }
}

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

After({ tags: "@cleanup-created-trip" }, async () => {
  await withE2EDb(async (db) => {
    await db.delete(trips).where(inArray(trips.name, CREATED_TRIP_NAMES));
  });
});

When("I open the New Trip dialog", async ({ page }) => {
  await page.getByRole("button", { name: "New trip", exact: true }).click();
});

When("I type {string} in the title field", async ({ page }, title: string) => {
  await page.getByRole("dialog").getByLabel("Title").fill(title);
});

When("I select dates {string} to {string}", async ({ page }, startDate: string, endDate: string) => {
  await page.getByRole("button", { name: /optional date range/i }).click();
  await clickDate(page, startDate);
  await clickDate(page, endDate);
});

When("I click the Create button", async ({ page }) => {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Create$/ })
    .click();
});

Then("I am on the trip detail page for {string}", async ({ page }, title: string) => {
  await expect(page).toHaveURL(/\/trips\/[^/?]+(\?new=1)?$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
});

Then("Day 1 is expanded", async ({ page }) => {
  const dayOneToggle = page
    .locator("button[aria-expanded]")
    .filter({ hasText: /Day 1|Aug 1/i })
    .first();
  await expect(dayOneToggle).toHaveAttribute("aria-expanded", "true");
});

Then("the day cards have the stagger animation class", async ({ page }) => {
  const animatedCard = page.locator('[data-testid^="day-card-stagger"]').first();
  await expect(animatedCard).toBeVisible({ timeout: 10_000 });
});

Then("the itinerary shows the empty state", async ({ page }) => {
  await expect(page.getByText("No itinerary yet")).toBeVisible();
});

Then("the Create button is not clickable during submission", async ({ page }) => {
  await expect(page.getByRole("dialog").getByRole("button", { name: /creating/i })).toBeDisabled({ timeout: 1000 });
});
