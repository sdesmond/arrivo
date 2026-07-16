import { expect } from "@playwright/test";
import { routeCache } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { e2eTripDateTime } from "../e2e-seed-data";
import { Before, Then, When } from "../fixtures";

interface Coords {
  lat: number;
  lng: number;
}

async function seedRouteCache(
  origin: Coords,
  destination: Coords,
  transitMode: string,
  distanceMeters: number,
  durationSeconds: number
): Promise<void> {
  await withE2EDb(async (db) => {
    await db
      .insert(routeCache)
      .values({
        originLat: origin.lat,
        originLng: origin.lng,
        destLat: destination.lat,
        destLng: destination.lng,
        transitMode,
        distanceMeters,
        durationSeconds,
      })
      .onConflictDoUpdate({
        target: [
          routeCache.originLat,
          routeCache.originLng,
          routeCache.destLat,
          routeCache.destLng,
          routeCache.transitMode,
        ],
        set: { distanceMeters, durationSeconds, fetchedAt: new Date() },
      });
  });
}

const CONFLICT_ORIGIN: Coords = { lat: 48.8566, lng: 2.3522 };
const CONFLICT_DESTINATION: Coords = { lat: 48.8576, lng: 2.3532 };

const NO_CONFLICT_ORIGIN: Coords = { lat: 48.9, lng: 2.4 };
const NO_CONFLICT_DESTINATION: Coords = { lat: 48.901, lng: 2.401 };

const FREEFORM_ORIGIN: Coords = { lat: 48.8, lng: 2.3 };
const FREEFORM_DESTINATION: Coords = { lat: 48.801, lng: 2.301 };

Before({ tags: "@trip-with-schedule-conflict" }, async ({ scenario }) => {
  // 20 minutes of seeded travel time against a 5-minute scheduled gap forces a conflict
  // deterministically, without depending on a live Mapbox lookup.
  await seedRouteCache(CONFLICT_ORIGIN, CONFLICT_DESTINATION, "drive", 500, 1200);
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "threeDayTrip",
      overrides: {
        events: [
          {
            name: "Hotel",
            position: 0,
            dayNumber: 1,
            locationLat: CONFLICT_ORIGIN.lat,
            locationLng: CONFLICT_ORIGIN.lng,
            startAt: e2eTripDateTime(0, "09:00:00"),
            endAt: e2eTripDateTime(0, "09:30:00"),
          },
          {
            name: "Museum",
            position: 1,
            dayNumber: 1,
            locationLat: CONFLICT_DESTINATION.lat,
            locationLng: CONFLICT_DESTINATION.lng,
            startAt: e2eTripDateTime(0, "09:35:00"),
            endAt: e2eTripDateTime(0, "10:30:00"),
          },
        ],
      },
      setCurrent: true,
    },
  });
});

Before({ tags: "@trip-without-schedule-conflict" }, async ({ scenario }) => {
  // 5 minutes of seeded travel time against a 4-hour scheduled gap comfortably fits, deterministically.
  await seedRouteCache(NO_CONFLICT_ORIGIN, NO_CONFLICT_DESTINATION, "drive", 500, 300);
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "threeDayTrip",
      overrides: {
        events: [
          {
            name: "Hotel",
            position: 0,
            dayNumber: 1,
            locationLat: NO_CONFLICT_ORIGIN.lat,
            locationLng: NO_CONFLICT_ORIGIN.lng,
            startAt: e2eTripDateTime(0, "09:00:00"),
            endAt: e2eTripDateTime(0, "09:00:00"),
          },
          {
            name: "Museum",
            position: 1,
            dayNumber: 1,
            locationLat: NO_CONFLICT_DESTINATION.lat,
            locationLng: NO_CONFLICT_DESTINATION.lng,
            startAt: e2eTripDateTime(0, "13:00:00"),
            endAt: e2eTripDateTime(0, "14:00:00"),
          },
        ],
      },
      setCurrent: true,
    },
  });
});

Before({ tags: "@trip-with-freeform-between-located-items" }, async ({ scenario }) => {
  // The Freeform Item ("Pack snacks") sits between two Located Items and has no coordinates,
  // so it must be skipped — the conflict is still evaluated directly between Cafe and Landmark.
  await seedRouteCache(FREEFORM_ORIGIN, FREEFORM_DESTINATION, "drive", 500, 1200);
  await scenario.materialize({
    user: { setCurrent: true },
    trip: {
      mother: "threeDayTrip",
      overrides: {
        events: [
          {
            name: "Cafe",
            position: 0,
            dayNumber: 1,
            locationLat: FREEFORM_ORIGIN.lat,
            locationLng: FREEFORM_ORIGIN.lng,
            startAt: e2eTripDateTime(0, "09:00:00"),
            endAt: e2eTripDateTime(0, "09:00:00"),
          },
          {
            name: "Pack snacks",
            position: 1,
            dayNumber: 1,
          },
          {
            name: "Landmark",
            position: 2,
            dayNumber: 1,
            locationLat: FREEFORM_DESTINATION.lat,
            locationLng: FREEFORM_DESTINATION.lng,
            startAt: e2eTripDateTime(0, "09:20:00"),
            endAt: e2eTripDateTime(0, "09:40:00"),
          },
        ],
      },
      setCurrent: true,
    },
  });
});

Then("the schedule conflict badge is visible", async ({ page }) => {
  await expect(page.getByText(/tight connections? today/)).toBeVisible();
});

When("I click the day-level schedule conflict button", async ({ page }) => {
  await page.getByRole("button", { name: /tight connections? today/ }).click();
});

Then("the URL gains a focus param", async ({ page }) => {
  await expect(page).toHaveURL(/focus=/);
});

Then("the schedule conflict badge is not visible", async ({ page }) => {
  await expect(page.getByText(/tight connections? today/)).toHaveCount(0);
});

Then("the {string} row shows a schedule conflict icon", async ({ page }, name: string) => {
  const row = page.locator('[id^="event-"]').filter({ hasText: name }).first();
  await expect(row.getByRole("button", { name: "Schedule conflict" })).toBeAttached();
});

Then("the {string} row shows no schedule conflict icon", async ({ page }, name: string) => {
  const row = page.locator('[id^="event-"]').filter({ hasText: name }).first();
  await expect(row.getByRole("button", { name: "Schedule conflict" })).toHaveCount(0);
});
