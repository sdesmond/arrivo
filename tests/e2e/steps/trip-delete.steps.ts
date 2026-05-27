import { expect } from "@playwright/test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import { After, Given, Then, When } from "../fixtures";
import { collaborators, days, trips, users } from "../../../src/db/schema";
import { E2E_DELETE_TRIP, E2E_USER } from "../e2e-seed-data";

async function removeDeleteTripFixture() {
  const client = postgres(process.env.E2E_DATABASE_URL!);
  const db = drizzle(client);

  try {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, E2E_USER.email));
    if (!user) return;

    await db.delete(trips).where(and(eq(trips.ownerId, user.id), eq(trips.name, E2E_DELETE_TRIP.name)));
  } finally {
    await client.end();
  }
}

Given("I have a trip available to delete from the listing page", async ({ page }) => {
  await removeDeleteTripFixture();

  const client = postgres(process.env.E2E_DATABASE_URL!);
  const db = drizzle(client);

  try {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, E2E_USER.email));
    if (!user) {
      throw new Error("Seeded E2E user not found");
    }

    const [trip] = await db
      .insert(trips)
      .values({
        ownerId: user.id,
        name: E2E_DELETE_TRIP.name,
        startDate: E2E_DELETE_TRIP.startDate,
        endDate: E2E_DELETE_TRIP.endDate,
      })
      .returning({ id: trips.id });

    await db.insert(collaborators).values({
      tripId: trip.id,
      userId: user.id,
      email: E2E_USER.email,
      name: E2E_USER.name,
      initials: E2E_USER.initials,
      role: "owner",
    });

    await db.insert(days).values([
      { tripId: trip.id, dayNumber: 1, date: E2E_DELETE_TRIP.startDate, label: "Day 1" },
      { tripId: trip.id, dayNumber: 2, date: "2026-08-02", label: "Day 2" },
      { tripId: trip.id, dayNumber: 3, date: E2E_DELETE_TRIP.endDate, label: "Day 3" },
    ]);
  } finally {
    await client.end();
  }

  await page.goto(`/trips?delete-fixture=${Date.now()}`);
  await expect(page.locator("a[href^='/trips/']").filter({ hasText: E2E_DELETE_TRIP.name }).first()).toBeVisible();
});

When("I open the trip options menu for {string}", async ({ page }, tripName: string) => {
  const tripCard = page.locator("a[href^='/trips/']").filter({ hasText: tripName }).first();
  await tripCard.getByTitle("Trip options").click();
});

When("I choose {string} from the trip options menu", async ({ page }, label: string) => {
  await page.getByRole("menuitem", { name: label }).click();
});

When("I confirm the trip deletion", async ({ page }) => {
  await page.getByRole("button", { name: "Delete" }).click();
});

Then("the trip {string} is no longer visible in the trip list", async ({ page }, tripName: string) => {
  await expect(page.locator("a[href^='/trips/']").filter({ hasText: tripName })).toHaveCount(0);
});

After({ tags: "@delete-trip-fixture" }, async () => {
  await removeDeleteTripFixture();
});
