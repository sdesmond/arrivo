import { expect } from "@playwright/test";
import { format, parseISO } from "date-fns";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { Given, When, Then, Before, After } from "../fixtures";
import { trips, collaborators, users } from "../../../src/db/schema";
import { E2E_TRIP, E2E_USER } from "../e2e-seed-data";
import { clearTripIdOverride, getTripIdOverride, setTripIdOverride } from "./scenario-state";

// The rename scenario persists a name change. Run it against a dedicated trip
// (distinct start date so it never collides with base-trip lookups used by the
// packing and other features in parallel workers) instead of mutating the shared
// seed trip — otherwise concurrent name-based card lookups intermittently miss it.
const RENAME_TRIP = { name: "Rename Source Trip", startDate: "2026-09-01", endDate: "2026-09-03" } as const;
let renameTripId: string | undefined;

Before({ tags: "@trip-rename" }, async () => {
  const client = postgres(process.env.E2E_DATABASE_URL!);
  const db = drizzle(client);
  try {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, E2E_USER.email));
    if (!user) throw new Error("Seeded E2E user not found");
    const [trip] = await db
      .insert(trips)
      .values({ ownerId: user.id, ...RENAME_TRIP })
      .returning({ id: trips.id });
    await db.insert(collaborators).values({
      tripId: trip.id,
      userId: user.id,
      email: E2E_USER.email,
      name: E2E_USER.name,
      initials: E2E_USER.initials,
      role: "owner",
    });
    renameTripId = trip.id;
    setTripIdOverride(trip.id);
  } finally {
    await client.end();
  }
});

After({ tags: "@trip-rename" }, async () => {
  clearTripIdOverride();
  if (!renameTripId) return;
  const client = postgres(process.env.E2E_DATABASE_URL!);
  const db = drizzle(client);
  try {
    await db.delete(trips).where(eq(trips.id, renameTripId));
  } finally {
    await client.end();
  }
  renameTripId = undefined;
});

Given("I have an existing trip", async ({ page }) => {
  const overriddenTripId = getTripIdOverride();
  if (overriddenTripId) {
    await page.goto(`/trips/${overriddenTripId}`);
    await page.waitForURL(/\/trips\/.+/);
    return;
  }

  const client = postgres(process.env.E2E_DATABASE_URL!);
  const db = drizzle(client);
  const [trip] = await db.select({ id: trips.id }).from(trips).where(eq(trips.startDate, E2E_TRIP.startDate));
  await client.end();
  if (!trip) throw new Error("Seeded E2E trip not found");
  await page.goto(`/trips/${trip.id}`);
  await page.waitForURL(/\/trips\/.+/);
});

When("I open the trip edit sheet", async ({ page }) => {
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

When("I change the trip name to {string}", async ({ page }, name: string) => {
  const nameInput = page.getByRole("dialog").getByRole("textbox").first();
  await nameInput.fill(name);
});

When("I save", async ({ page }) => {
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

Then("the trip should display {string}", async ({ page }, name: string) => {
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
});

When("I tab to the edit button and press Enter", async ({ page }) => {
  await page.getByRole("button", { name: "Edit" }).press("Enter");
});

Then("the edit sheet should open with focus inside", async ({ page }) => {
  await expect(page.getByRole("dialog")).toBeVisible();
  const focused = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  expect(focused).toBe(true);
});

When("I press Escape", async ({ page }) => {
  await page.keyboard.press("Escape");
});

Then("the sheet should close and focus should return to the edit button", async ({ page }) => {
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toBeFocused();
});

When("I close the trip edit sheet without saving", async ({ page }) => {
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

Then("the trip edit sheet shows the original dates", async ({ page }) => {
  const originalRangeLabel = new RegExp(
    `${format(parseISO(E2E_TRIP.startDate), "MMM d, yyyy")}.*${format(parseISO(E2E_TRIP.endDate), "MMM d, yyyy")}`
  );

  await expect(page.getByRole("dialog").getByRole("button", { name: originalRangeLabel }).first()).toBeVisible();
});

When("I navigate to the trips list", async ({ page }) => {
  await page.goto("/trips");
});

Then("I see an {string} section with {string}", async ({ page }, sectionTitle: string, tripName: string) => {
  await expect(page.getByRole("heading", { name: sectionTitle })).toBeVisible();
  await expect(page.getByText(tripName).first()).toBeVisible();
});
