import { expect, type APIResponse, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { days, documents, events, pendingFileDeletions, trips } from "../../../src/db/schema";
import { E2E_STORAGE_DIRECTORY } from "../../../scripts/e2e-storage.mjs";
import { E2E_TRIP_SECOND_DATE, E2E_TRIP_START_DATE } from "../e2e-seed-data";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { Given, When, Then, After } from "../fixtures";

interface DateState {
  tripId: string;
  eventId: string;
  file: string;
  confirmation?: unknown;
  response?: APIResponse;
}
const states = new WeakMap<Page, DateState>();
const END_DATES: Record<number, string> = { 1: E2E_TRIP_START_DATE, 2: E2E_TRIP_SECOND_DATE };

function state(page: Page): DateState {
  const current = states.get(page);
  if (!current) throw new Error("Trip date fixture missing");
  return current;
}
function headers(page: Page) {
  return { "x-arrivo-client": "web", origin: new URL(page.url()).origin };
}
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
function storedPath(page: Page): string {
  return join(resolve(E2E_STORAGE_DIRECTORY), state(page).file);
}
async function patchTrip(page: Page, data: Record<string, unknown>): Promise<APIResponse> {
  const current = state(page);
  current.response = await (
    await apiClient(page)
  ).patch(`/api/v1/trips/${current.tripId}`, { headers: headers(page), data });
  return current.response;
}
async function readTrip(tripId: string) {
  const [trip] = await withE2EDb((database) => database.select().from(trips).where(eq(trips.id, tripId)));
  return trip;
}

Given("a final-day event with a stored document for the trip date API", async ({ page, scenario }) => {
  const tripId = scenario.currentTrip!.id;
  const storageRoot = resolve(E2E_STORAGE_DIRECTORY);
  const fixture = await withE2EDb(async (database) => {
    const [day] = await database
      .select({ id: days.id })
      .from(days)
      .where(and(eq(days.tripId, tripId), eq(days.dayNumber, 3)));
    const [event] = await database
      .insert(events)
      .values({ tripId, dayId: day.id, name: "Date API farewell", position: 0 })
      .returning({ id: events.id });
    const file = `event-documents/${event.id}/${randomUUID()}.pdf`;
    await mkdir(join(storageRoot, "event-documents", event.id), { recursive: true });
    await writeFile(join(storageRoot, file), "date api");
    await database.insert(documents).values({
      tripId,
      eventId: event.id,
      name: "Farewell doc",
      kind: "pdf",
      size: "1",
      url: `/api/storage/${file}`,
    });
    return { eventId: event.id, file };
  });
  states.set(page, { tripId, ...fixture });
});
After(async ({ page }) => {
  const current = states.get(page);
  if (current) await rm(join(resolve(E2E_STORAGE_DIRECTORY), current.file), { force: true });
});

When("I PATCH the trip to end on day {int} and a new name", async ({ page }, day: number) => {
  const response = await patchTrip(page, { name: "Shortened by API", endDate: END_DATES[day] });
  if (response.status() === 409) state(page).confirmation = (await response.json()).error.confirmation;
});
When(
  "I PATCH the trip to end on day {int} resolving with {string}",
  async ({ page }, day: number, resolution: string) => {
    await patchTrip(page, {
      name: "Shortened by API",
      endDate: END_DATES[day],
      resolution,
      confirmation: state(page).confirmation,
    });
  }
);
When("I PATCH the trip to end on day {int} with a resolution but no confirmation", async ({ page }, day: number) => {
  await patchTrip(page, { endDate: END_DATES[day], resolution: "delete-events" });
});
When("the final-day event is renamed before the confirmation is applied", async ({ page }) => {
  const current = state(page);
  await withE2EDb((database) =>
    database.update(events).set({ name: "Date API farewell renamed" }).where(eq(events.id, current.eventId))
  );
});
When("I clear the trip dates through the API", async ({ page }) => {
  await patchTrip(page, { startDate: null, endDate: null });
});

Then("the trip date API returns {int}", async ({ page }, status: number) => {
  expect(state(page).response?.status()).toBe(status);
});
Then("the trip date API returns {int} with code {string}", async ({ page }, status: number, code: string) => {
  const response = state(page).response!;
  expect(response.status()).toBe(status);
  expect((await response.json()).error.code).toBe(code);
});
Then("the trip date API asks for confirmation naming the final-day event", async ({ page }) => {
  const response = state(page).response!;
  expect(response.status()).toBe(409);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const { error } = await response.json();
  expect(error.code).toBe("confirmation_required");
  expect(error.confirmation.events).toEqual([expect.objectContaining({ name: "Date API farewell", docCount: 1 })]);
});
Then("the trip still has its original dates, name, event and file", async ({ page, scenario }) => {
  const current = state(page);
  const trip = await readTrip(current.tripId);
  expect(trip.name).toBe(scenario.currentTrip!.name);
  expect(trip.endDate).toBe(scenario.currentTrip!.endDate);
  const rows = await withE2EDb((database) => database.select().from(events).where(eq(events.id, current.eventId)));
  expect(rows).toHaveLength(1);
  expect(rows[0].dayId).not.toBeNull();
  expect(await fileExists(storedPath(page))).toBe(true);
});
Then("the final-day event and its stored file are deleted and the trip ends on its first day", async ({ page }) => {
  const current = state(page);
  const trip = await readTrip(current.tripId);
  expect(trip.name).toBe("Shortened by API");
  expect(trip.endDate).toBe(E2E_TRIP_START_DATE);
  const rows = await withE2EDb((database) => database.select().from(events).where(eq(events.id, current.eventId)));
  expect(rows).toEqual([]);
  await expect.poll(() => fileExists(storedPath(page)), { timeout: 15_000 }).toBe(false);
  // The queue row clears once the file is gone.
  await expect
    .poll(
      async () =>
        (
          await withE2EDb((database) =>
            database
              .select()
              .from(pendingFileDeletions)
              .where(eq(pendingFileDeletions.url, `/api/storage/${current.file}`))
          )
        ).length,
      { timeout: 15_000 }
    )
    .toBe(0);
  const remaining = await withE2EDb((database) => database.select().from(days).where(eq(days.tripId, current.tripId)));
  expect(remaining.map((day) => day.dayNumber)).toEqual([1]);
});
Then("the final-day event is kept unscheduled with its file", async ({ page }) => {
  const current = state(page);
  const trip = await readTrip(current.tripId);
  expect(trip.endDate).toBe(E2E_TRIP_SECOND_DATE);
  const [event] = await withE2EDb((database) => database.select().from(events).where(eq(events.id, current.eventId)));
  expect(event.dayId).toBeNull();
  expect(event.displacedDate).not.toBeNull();
  expect(await fileExists(storedPath(page))).toBe(true);
});
Then("the trip has no dates and still has its three days", async ({ page }) => {
  const current = state(page);
  const trip = await readTrip(current.tripId);
  expect(trip.startDate).toBeNull();
  expect(trip.endDate).toBeNull();
  const rows = await withE2EDb((database) => database.select().from(days).where(eq(days.tripId, current.tripId)));
  expect(rows).toHaveLength(3);
  expect(rows.every((day) => day.date === null)).toBe(true);
});
