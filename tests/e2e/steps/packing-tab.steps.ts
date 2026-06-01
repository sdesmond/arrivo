import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import { packingItems, trips, users } from "../../../src/db/schema";
import {
  E2E_PACKING_ITEMS,
  E2E_PACKING_ITEMS_WITH_LABELS,
  E2E_PACKING_REORDER_ITEMS,
  E2E_TRIP,
  E2E_USER,
} from "../e2e-seed-data";
import { After, Before, Given, Then, When } from "../fixtures";

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

async function seedPackingItems(
  db: ReturnType<typeof drizzle>,
  tripId: string,
  itemsToSeed: typeof E2E_PACKING_ITEMS
): Promise<void> {
  await db.delete(packingItems).where(eq(packingItems.tripId, tripId));
  for (const item of itemsToSeed) {
    await db.insert(packingItems).values({ ...item, tripId });
  }
}

Before({ tags: "@packing-tab" }, async () => {
  // check-persistence scenarios use pre-seeded items via explicit Given step
});

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

Given("I have pre-seeded packing items for the trip", async ({ page }) => {
  await withE2EDb(async (db) => {
    const tripId = await getBaseTripId(db);
    if (!tripId) throw new Error("E2E trip not found — cannot seed packing items");
    await seedPackingItems(db, tripId, E2E_PACKING_ITEMS);
  });
  await page.goto(page.url());
  await page.waitForURL(/\/trips/);
});

Given("I have pre-seeded packing items with labels for the trip", async ({ page }) => {
  await withE2EDb(async (db) => {
    const tripId = await getBaseTripId(db);
    if (!tripId) throw new Error("E2E trip not found — cannot seed packing items");
    await seedPackingItems(db, tripId, E2E_PACKING_ITEMS_WITH_LABELS);
  });
  await page.goto(page.url());
  await page.waitForURL(/\/trips/);
});

Given("I have pre-seeded packing reorder items for the trip", async ({ page }) => {
  await withE2EDb(async (db) => {
    const tripId = await getBaseTripId(db);
    if (!tripId) throw new Error("E2E trip not found — cannot seed reorder items");
    await seedPackingItems(db, tripId, E2E_PACKING_REORDER_ITEMS);
  });
  await page.goto(page.url());
  await page.waitForURL(/\/trips/);
});

Given("the packing item {string} is already checked", async ({ page }, name: string) => {
  await withE2EDb(async (db) => {
    const tripId = await getBaseTripId(db);
    if (!tripId) throw new Error("E2E trip not found");
    await db
      .update(packingItems)
      .set({ done: true })
      .where(and(eq(packingItems.tripId, tripId), eq(packingItems.name, name)));
  });
  await page.goto(page.url());
  await page.waitForURL(/\/trips/);
});

When("I check the packing item named {string}", async ({ page }, name: string) => {
  await page.getByRole("checkbox", { name: `Pack ${name}` }).click();
  await expect(page.getByRole("checkbox", { name: `Pack ${name}` })).toHaveAttribute("aria-checked", "true", {
    timeout: 10_000,
  });
});

When("I uncheck the packing item named {string}", async ({ page }, name: string) => {
  await page.getByRole("checkbox", { name: `Pack ${name}` }).click();
  await expect(page.getByRole("checkbox", { name: `Pack ${name}` })).toHaveAttribute("aria-checked", "false", {
    timeout: 10_000,
  });
});

When("I keyboard-move the item {string} down one position", async ({ page }, name: string) => {
  const dragHandle = page.getByTitle(`Reorder ${name}`);
  await dragHandle.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(async () => {
    const names = await page.locator("[data-packing-name]").allTextContents();
    const index = names.map((itemName) => itemName.trim()).indexOf(name);
    expect(index).toBe(1);
  }).toPass({ timeout: 10_000 });
});

Then("the packing item {string} should be checked", async ({ page }, name: string) => {
  await expect(page.getByRole("checkbox", { name: `Pack ${name}` })).toHaveAttribute("aria-checked", "true");
});

Then("the packing item {string} should be unchecked", async ({ page }, name: string) => {
  await expect(page.getByRole("checkbox", { name: `Pack ${name}` })).toHaveAttribute("aria-checked", "false");
});

Then("the trip card for {string} should show {string}", async ({ page }, tripName: string, progress: string) => {
  const card = page.locator("a").filter({ hasText: tripName }).first();
  await expect(card).toContainText(progress);
});

When("I open the trip and go to the Packing tab", async ({ page }) => {
  const tripLink = page.locator("a").filter({ hasText: "E2E Test Trip" }).first();
  await tripLink.click();
  await page.waitForURL(/\/trips\/.+/);
  await openPackingTab(page);
});

When("I return to the trips list", async ({ page }) => {
  await page.locator("#main-content").getByRole("link", { name: "Trips" }).click();
  await page.waitForURL("/trips");
});
