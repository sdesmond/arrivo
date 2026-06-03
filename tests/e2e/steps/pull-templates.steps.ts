import { expect, type Locator } from "@playwright/test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import {
  collaborators,
  days,
  packingItems,
  packingTemplateItems,
  packingTemplates,
  trips,
  users,
} from "../../../src/db/schema";
import { After, Before, Given, Then, When } from "../fixtures";
import {
  E2E_DAYS,
  E2E_TEMPLATE_PULL,
  E2E_TEMPLATE_PULL_2,
  E2E_TEMPLATE_PULL_2_ITEMS,
  E2E_TEMPLATE_PULL_ITEMS,
  E2E_PULL_USER,
} from "../e2e-seed-data";

const E2E_PULL_TRIP = {
  name: "E2E Pull Trip",
  startDate: "2026-07-11",
  endDate: "2026-07-13",
  coverImageUrl: "graphic:var(--accent-brand)/plane",
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function withE2EDb<T>(fn: (db: ReturnType<typeof drizzle>) => Promise<T>): Promise<T> {
  const client = postgres(process.env.E2E_DATABASE_URL!);
  const db = drizzle(client);
  try {
    return await fn(db);
  } finally {
    await client.end();
  }
}

async function getE2EUserId(db: ReturnType<typeof drizzle>): Promise<string> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, E2E_PULL_USER.email));
  if (!user) throw new Error("E2E user not found");
  return user.id;
}

async function getPullTripId(db: ReturnType<typeof drizzle>): Promise<string> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, E2E_PULL_USER.email));
  if (!user) throw new Error("E2E user not found");
  const [trip] = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.ownerId, user.id), eq(trips.name, E2E_PULL_TRIP.name)));
  if (!trip) throw new Error("E2E trip not found");
  return trip.id;
}

async function clearPullTestState(): Promise<void> {
  await withE2EDb(async (db) => {
    const userId = await getE2EUserId(db);
    await db
      .delete(packingTemplates)
      .where(and(eq(packingTemplates.userId, userId), eq(packingTemplates.name, E2E_TEMPLATE_PULL.name)));
    await db
      .delete(packingTemplates)
      .where(and(eq(packingTemplates.userId, userId), eq(packingTemplates.name, E2E_TEMPLATE_PULL_2.name)));
    await db.delete(trips).where(and(eq(trips.ownerId, userId), eq(trips.name, E2E_PULL_TRIP.name)));
  });
}

async function seedPullTrip(): Promise<void> {
  await withE2EDb(async (db) => {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, E2E_PULL_USER.email));
    if (!user) throw new Error("E2E user not found");

    const [trip] = await db
      .insert(trips)
      .values({ ownerId: user.id, ...E2E_PULL_TRIP })
      .returning({ id: trips.id });

    await db.insert(collaborators).values({
      tripId: trip.id,
      userId: user.id,
      email: E2E_PULL_USER.email,
      name: E2E_PULL_USER.name,
      initials: E2E_PULL_USER.initials,
      role: "owner",
    });

    for (const day of E2E_DAYS) {
      await db.insert(days).values({ tripId: trip.id, ...day });
    }
  });
}

async function seedPullTemplate(): Promise<void> {
  await withE2EDb(async (db) => {
    const userId = await getE2EUserId(db);
    const [template] = await db
      .insert(packingTemplates)
      .values({ userId, name: E2E_TEMPLATE_PULL.name })
      .returning({ id: packingTemplates.id });
    for (const item of E2E_TEMPLATE_PULL_ITEMS) {
      await db.insert(packingTemplateItems).values({ templateId: template.id, ...item });
    }
  });
}

async function seedTwoPullTemplates(): Promise<void> {
  await withE2EDb(async (db) => {
    const userId = await getE2EUserId(db);
    const [t1] = await db
      .insert(packingTemplates)
      .values({ userId, name: E2E_TEMPLATE_PULL.name })
      .returning({ id: packingTemplates.id });
    for (const item of E2E_TEMPLATE_PULL_ITEMS) {
      await db.insert(packingTemplateItems).values({ templateId: t1.id, ...item });
    }
    const [t2] = await db
      .insert(packingTemplates)
      .values({ userId, name: E2E_TEMPLATE_PULL_2.name })
      .returning({ id: packingTemplates.id });
    for (const item of E2E_TEMPLATE_PULL_2_ITEMS) {
      await db.insert(packingTemplateItems).values({ templateId: t2.id, ...item });
    }
  });
}

async function checkTemplate(dialog: Locator, name: string): Promise<void> {
  const checkbox = dialog.getByRole("checkbox", { name: new RegExp(`^${escapeRegExp(name)}$`) }).first();
  await expect(checkbox).toBeVisible({ timeout: 5_000 });
  await checkbox.check();
}

Before({ tags: "@pull-templates" }, async () => {
  await clearPullTestState();
  await seedPullTrip();
});

After({ tags: "@pull-templates" }, async () => {
  await clearPullTestState();
});

Given("I have a trip with no packing items for pull", async () => {
  await withE2EDb(async (db) => {
    const tripId = await getPullTripId(db);
    await db.delete(packingItems).where(eq(packingItems.tripId, tripId));
  });
});

Given("I have a trip with a pre-seeded packing item for pull", async () => {
  await withE2EDb(async (db) => {
    const tripId = await getPullTripId(db);
    await db.delete(packingItems).where(eq(packingItems.tripId, tripId));
    await db.insert(packingItems).values({ tripId, name: "Laptop", isLabel: false, done: false, position: 0 });
  });
});

Given("I have a packing template available for pull", async () => {
  await seedPullTemplate();
});

Given("I have two packing templates available for pull with a shared item", async () => {
  await seedTwoPullTemplates();
});

Given("I am signed in as the template pull user", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Email" }).fill(E2E_PULL_USER.email);
  await page.getByRole("textbox", { name: "Password" }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/trips/, { timeout: 15_000 });
});

When("I open the packing tab for the pull test trip", async ({ page }) => {
  const tripId = await withE2EDb((db) => getPullTripId(db));
  // Navigate with a unique query to avoid serial-scenario reuse of stale RSC payloads.
  await page.goto(`/trips/${tripId}?e2e=${Date.now()}`);
  await page.waitForURL(/\/trips\/.+/);
  await page.getByRole("button", { name: "Packing" }).click();
  await expect(page.getByRole("button", { name: "Add item", exact: true })).toBeVisible({ timeout: 10_000 });
});

When("I pull the template onto the trip", async ({ page }) => {
  const pullBtn = page
    .getByRole("button", { name: "Pull from a template" })
    .or(page.getByRole("button", { name: "Pull templates" }))
    .first();
  await pullBtn.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await expect(dialog.getByRole("checkbox").first()).toBeVisible({ timeout: 5_000 });
  await checkTemplate(dialog, E2E_TEMPLATE_PULL.name);
  await page.getByRole("button", { name: /Pull selected/ }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText(/item\(s\) added/)).toBeVisible({ timeout: 10_000 });
});

When("I pull both templates onto the trip", async ({ page }) => {
  const pullBtn = page
    .getByRole("button", { name: "Pull from a template" })
    .or(page.getByRole("button", { name: "Pull templates" }))
    .first();
  await pullBtn.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await expect(dialog.getByRole("checkbox").first()).toBeVisible({ timeout: 5_000 });
  await checkTemplate(dialog, E2E_TEMPLATE_PULL.name);
  await checkTemplate(dialog, E2E_TEMPLATE_PULL_2.name);
  await page.getByRole("button", { name: /Pull selected/ }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText(/item\(s\) added/)).toBeVisible({ timeout: 10_000 });
});

Then('I should see a "Pull from a template" button', async ({ page }) => {
  await expect(page.getByRole("button", { name: "Pull from a template" })).toBeVisible();
});

Then("the packing list should contain {string} exactly once", async ({ page }, name: string) => {
  await expect(async () => {
    const items = page.locator("[data-packing-kind]").filter({ hasText: name });
    await expect(items).toHaveCount(1);
  }).toPass({ timeout: 10_000 });
});

Then("I should see a duplicate notice", async ({ page }) => {
  await expect(page.getByText(/duplicate\(s\) skipped/)).toBeVisible({ timeout: 10_000 });
});
