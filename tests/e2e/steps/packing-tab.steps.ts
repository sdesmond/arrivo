import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import { packingItems, trips, users } from "../../../src/db/schema";
import { E2E_TRIP, E2E_USER } from "../e2e-seed-data";
import { After, Then, When } from "../fixtures";

async function withE2EDb<T>(fn: (db: ReturnType<typeof drizzle>) => Promise<T>): Promise<T> {
  const client = postgres(process.env.E2E_DATABASE_URL!);
  const db = drizzle(client);

  try {
    return await fn(db);
  } finally {
    await client.end();
  }
}

async function getBaseTripId(db: ReturnType<typeof drizzle>): Promise<string | undefined> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, E2E_USER.email));
  if (!user) return undefined;

  const [trip] = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.ownerId, user.id), eq(trips.startDate, E2E_TRIP.startDate)));

  return trip?.id;
}

async function openPackingTab(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Packing" }).click();
  await expect(page.getByRole("button", { name: "Add item" })).toBeVisible({ timeout: 10_000 });
}

After({ tags: "@packing-tab" }, async () => {
  await withE2EDb(async (db) => {
    const tripId = await getBaseTripId(db);
    if (!tripId) {
      console.warn("packing-tab After hook: E2E trip not found — packing cleanup skipped");
      return;
    }
    await db.delete(packingItems).where(eq(packingItems.tripId, tripId));
  });
});

When("I open the Packing tab", async ({ page }) => {
  await openPackingTab(page);
});

Then("I should see the empty packing state", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Your packing list is empty" })).toBeVisible();
});

When("I add a packing item named {string}", async ({ page }, name: string) => {
  await page.getByRole("textbox", { name: "Packing item name" }).fill(name);
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.locator('[data-packing-kind="item"]').filter({ hasText: name }).first()).toBeVisible({
    timeout: 10_000,
  });
});

When("I add a packing label named {string}", async ({ page }, name: string) => {
  await page.getByRole("textbox", { name: "Packing item name" }).fill(name);
  await page.getByRole("button", { name: "Add label" }).click();
  await expect(page.locator('[data-packing-kind="label"]').filter({ hasText: name }).first()).toBeVisible({
    timeout: 10_000,
  });
});

Then("the packing list should contain {string}", async ({ page }, name: string) => {
  await expect(page.locator("[data-packing-kind]").filter({ hasText: name }).first()).toBeVisible();
});

Then("the packing list should show the label {string}", async ({ page }, name: string) => {
  const labelRow = page.locator('[data-packing-kind="label"]').filter({ hasText: name }).first();
  await expect(labelRow).toBeVisible();
  await expect(labelRow.getByRole("heading", { name })).toBeVisible();
});

When("I delete the packing entry named {string}", async ({ page }, name: string) => {
  await page
    .getByRole("button", { name: `Remove ${name}` })
    .first()
    .click();
  await expect(page.locator("[data-packing-kind]").filter({ hasText: name })).toHaveCount(0, { timeout: 10_000 });
});

Then("the packing list should not contain {string}", async ({ page }, name: string) => {
  await expect(page.locator("[data-packing-kind]").filter({ hasText: name })).toHaveCount(0);
});

When("I reload the trip page", async ({ page }) => {
  await page.reload();
  await page.waitForURL(/\/trips\/.+/);
  await openPackingTab(page);
});

Then(
  "the packing list order should be {string} then {string} then {string}",
  async ({ page }, first: string, second: string, third: string) => {
    await expect(async () => {
      const names = await page.locator("[data-packing-name]").allTextContents();
      expect(names.map((name) => name.trim())).toEqual([first, second, third]);
    }).toPass({ timeout: 10_000 });
  }
);
