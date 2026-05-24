import { expect } from "@playwright/test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import { Before, Given, When, Then } from "../fixtures";
import { documents, events, days, trips, users } from "../../../src/db/schema";
import {
  E2E_USER,
  E2E_TRIP,
  E2E_PICK_DOC,
  E2E_EVENT_KEEP,
  E2E_EVENT_ERASE,
  E2E_KEEP_DOC,
  E2E_ERASE_DOC,
  E2E_EVENT_MANAGE,
  E2E_MANAGE_DOC,
} from "../e2e-seed-data";

function escapeRegex(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

Before({ tags: "@reseed-delete-events" }, async () => {
  const client = postgres(process.env.E2E_DATABASE_URL!);
  const db = drizzle(client);
  try {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, E2E_USER.email));
    if (!user) return;
    const [trip] = await db
      .select({ id: trips.id })
      .from(trips)
      .where(and(eq(trips.ownerId, user.id), eq(trips.startDate, E2E_TRIP.startDate)));
    if (!trip) return;
    const [day1] = await db
      .select({ id: days.id })
      .from(days)
      .where(and(eq(days.tripId, trip.id), eq(days.dayNumber, 1)));
    if (!day1) return;

    // Drop any existing keep/erase events (cascade deletes their docs)
    for (const name of [E2E_EVENT_KEEP.name, E2E_EVENT_ERASE.name]) {
      await db.delete(events).where(and(eq(events.tripId, trip.id), eq(events.name, name)));
    }

    const [eKeep] = await db
      .insert(events)
      .values({ dayId: day1.id, tripId: trip.id, name: E2E_EVENT_KEEP.name, position: E2E_EVENT_KEEP.position })
      .returning({ id: events.id });
    const [eErase] = await db
      .insert(events)
      .values({ dayId: day1.id, tripId: trip.id, name: E2E_EVENT_ERASE.name, position: E2E_EVENT_ERASE.position })
      .returning({ id: events.id });

    await db.insert(documents).values({ tripId: trip.id, eventId: eKeep.id, ...E2E_KEEP_DOC });
    await db.insert(documents).values({ tripId: trip.id, eventId: eErase.id, ...E2E_ERASE_DOC });
  } finally {
    await client.end();
  }
});

// Resets E2E Pick Doc to trip-level (eventId = null) before each pick-list scenario.
// E2E_PICK_DOC is a dedicated document for pick-list tests; E2E_DOCUMENT ("E2E Boarding Pass")
// is never mutated by pick-list scenarios, keeping Documents-tab tests race-free in parallel runs.
Before({ tags: "@reseed-pick-list" }, async () => {
  const client = postgres(process.env.E2E_DATABASE_URL!);
  const db = drizzle(client);
  try {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, E2E_USER.email));
    if (!user) return;
    const [trip] = await db
      .select({ id: trips.id })
      .from(trips)
      .where(and(eq(trips.ownerId, user.id), eq(trips.startDate, E2E_TRIP.startDate)));
    if (!trip) return;
    await db
      .update(documents)
      .set({ eventId: null })
      .where(and(eq(documents.tripId, trip.id), eq(documents.name, E2E_PICK_DOC.name)));
  } finally {
    await client.end();
  }
});

Given("I am on the Itinerary tab", async ({ page }) => {
  await page.getByRole("button", { name: "Itinerary" }).click();
  await page.waitForTimeout(500);
});

Given("I expand Day 1", async ({ page }) => {
  // Day 1 is 2026-07-01; header shows "Wed, Jul 1" (MM/DD) or "Wed, 1 Jul" (DD/MM)
  const toggleBtn = page.getByRole("button", { name: /wed.*(jul\s*1|1\s*jul)/i }).first();
  await toggleBtn.click();
  await expect(page.getByText("E2E Event", { exact: true })).toBeVisible({ timeout: 5_000 });
});

When("I click the Attach button on {string}", async ({ page }, eventName: string) => {
  // Locate the specific event's Attach button via the action bar sibling of the event name
  await page
    .locator("div")
    .filter({ hasText: new RegExp(eventName) })
    .filter({ has: page.getByTitle("Attach document") })
    .getByTitle("Attach document")
    .first()
    .click();
});

Then("the pick list panel shows {string}", async ({ page }, docName: string) => {
  await expect(page.getByRole("button", { name: docName })).toBeVisible({ timeout: 5_000 });
});

When("I select {string} from the pick list", async ({ page }, docName: string) => {
  await page.getByRole("button", { name: docName }).click();
});

Then("the AddDocDialog is closed", async ({ page }) => {
  await expect(page.getByText("Attach document")).not.toBeVisible({ timeout: 5_000 });
});

When("I click {string}", async ({ page }, buttonText: string) => {
  await page.getByRole("button", { name: buttonText }).click();
});

Then("the upload panel is shown with the Attach button", async ({ page }) => {
  await expect(page.getByRole("button", { name: /^attach$/i })).toBeVisible({ timeout: 5_000 });
});

When("I delete the event {string}", async ({ page }, eventName: string) => {
  await page
    .locator("div")
    .filter({ hasText: new RegExp(`^${escapeRegex(eventName)}`) })
    .filter({ has: page.getByTitle("Delete event") })
    .getByTitle("Delete event")
    .first()
    .click();
});

Then("the delete event dialog is shown", async ({ page }) => {
  await expect(page.getByRole("button", { name: /keep documents/i })).toBeVisible({ timeout: 5_000 });
});

Then("the delete event dialog is closed", async ({ page }) => {
  await expect(page.getByRole("button", { name: /keep documents/i })).not.toBeVisible({ timeout: 3_000 });
});

Then("{string} is no longer visible in the itinerary", async ({ page }, eventName: string) => {
  await expect(page.getByText(eventName, { exact: true })).not.toBeVisible({ timeout: 10_000 });
});

Then("the Documents tab shows {string}", async ({ page }, docName: string) => {
  await page.getByRole("button", { name: "Documents" }).click();
  await expect(page.getByText(docName, { exact: true })).toBeVisible({ timeout: 10_000 });
});

Then("the Documents tab does not show {string}", async ({ page }, docName: string) => {
  await page.getByRole("button", { name: "Documents" }).click();
  await expect(page.getByText(docName, { exact: true })).not.toBeVisible({ timeout: 5_000 });
});

// ── Event doc management: view, rename, promote ───────────────────────────

Before({ tags: "@reseed-manage-event" }, async () => {
  const client = postgres(process.env.E2E_DATABASE_URL!);
  const db = drizzle(client);
  try {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, E2E_USER.email));
    if (!user) return;
    const [trip] = await db
      .select({ id: trips.id })
      .from(trips)
      .where(and(eq(trips.ownerId, user.id), eq(trips.startDate, E2E_TRIP.startDate)));
    if (!trip) return;
    const [day1] = await db
      .select({ id: days.id })
      .from(days)
      .where(and(eq(days.tripId, trip.id), eq(days.dayNumber, 1)));
    if (!day1) return;

    await db.delete(events).where(and(eq(events.tripId, trip.id), eq(events.name, E2E_EVENT_MANAGE.name)));

    const [eManage] = await db
      .insert(events)
      .values({ dayId: day1.id, tripId: trip.id, name: E2E_EVENT_MANAGE.name, position: E2E_EVENT_MANAGE.position })
      .returning({ id: events.id });
    await db.insert(documents).values({ tripId: trip.id, eventId: eManage.id, ...E2E_MANAGE_DOC });
  } finally {
    await client.end();
  }
});

When("I expand the docs for event {string}", async ({ page }, eventName: string) => {
  await page
    .locator("div")
    .filter({ hasText: new RegExp(`^${escapeRegex(eventName)}`) })
    .getByRole("button", { name: /doc/i })
    .first()
    .click();
  await expect(page.getByRole("button", { name: `View ${E2E_MANAGE_DOC.name}` })).toBeVisible({ timeout: 5_000 });
});

When("I rename the event doc {string} to {string}", async ({ page }, oldName: string, newName: string) => {
  await page.getByText(oldName, { exact: true }).first().click();
  const input = page.getByRole("textbox");
  await input.fill(newName);
  await input.press("Enter");
});

Then("the event doc {string} is visible", async ({ page }, docName: string) => {
  await expect(page.getByText(docName, { exact: true }).first()).toBeVisible({ timeout: 5_000 });
});

When("I promote the event doc {string} to trip level", async ({ page }, docName: string) => {
  await page.getByRole("button", { name: `Move ${docName} to trip` }).click();
});

Then("the event doc {string} is no longer visible in the event", async ({ page }, docName: string) => {
  await expect(page.getByRole("button", { name: `Move ${docName} to trip` })).not.toBeVisible({ timeout: 10_000 });
});
