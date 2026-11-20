import { expect, type APIResponse, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { E2E_STORAGE_DIRECTORY } from "../../../scripts/e2e-storage.mjs";
import {
  collaborators,
  days,
  documents,
  events,
  pendingFileDeletions,
  reservations,
  trips,
} from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { Given, When, Then, After } from "../fixtures";

interface DeleteState {
  tripId: string;
  responses: APIResponse[];
  urls: string[];
}
const states = new WeakMap<Page, DeleteState>();
function state(page: Page): DeleteState {
  const current = states.get(page);
  if (!current) throw new Error("Trip delete API fixture missing");
  return current;
}

Given("a trip for the delete API where I am {string}", async ({ page, scenario }, role: string) => {
  const me = await scenario.ensureCurrentUser();
  const owner = role === "manager" ? me : (await scenario.materialize({ user: { setCurrent: false } })).user!;
  const { trip } = await scenario.materialize({ trip: { ownerId: owner.id, setCurrent: false } });
  const { trip: otherTrip } = await scenario.materialize({ trip: { ownerId: owner.id, setCurrent: false } });
  if (role === "editor")
    await withE2EDb((database) =>
      database.insert(collaborators).values({
        tripId: trip!.id,
        userId: me.id,
        name: me.name,
        initials: me.initials,
        role: "editor",
        isCreator: false,
      })
    );
  const urls = Array.from({ length: 3 }, () => `/api/storage/trip-delete/${randomUUID()}`);
  await mkdir(join(resolve(E2E_STORAGE_DIRECTORY), "trip-delete"), { recursive: true });
  for (const url of urls)
    await writeFile(join(resolve(E2E_STORAGE_DIRECTORY), url.slice("/api/storage/".length)), "document");
  await withE2EDb(async (database) => {
    const [event] = await database
      .insert(events)
      .values({ tripId: trip!.id, name: "Legacy event", position: 0 })
      .returning();
    // The event belongs to a different trip directly, but cascades through this trip's day.
    const [day] = await database.select({ id: days.id }).from(days).where(eq(days.tripId, trip!.id));
    const [dayEvent] = await database
      .insert(events)
      .values({
        tripId: otherTrip!.id,
        dayId: day.id,
        name: "Legacy day event",
        position: 0,
      })
      .returning();
    const [reservation] = await database
      .insert(reservations)
      .values({ tripId: trip!.id, type: "flight", provider: "Legacy" })
      .returning();
    await database.insert(documents).values([
      { eventId: event.id, name: "Event", kind: "pdf", url: urls[0] },
      { reservationId: reservation.id, name: "Reservation", kind: "pdf", url: urls[1] },
      { eventId: dayEvent.id, name: "Day event", kind: "pdf", url: urls[2] },
    ]);
  });
  states.set(page, { tripId: trip!.id, responses: [], urls });
});

When("I delete the trip through the API twice with the same key", async ({ page }) => {
  const current = state(page);
  const key = randomUUID();
  for (let i = 0; i < 2; i++)
    current.responses.push(
      await (
        await apiClient(page)
      ).delete(`/api/v1/trips/${current.tripId}`, {
        headers: { "x-arrivo-client": "web", origin: new URL(page.url()).origin, "Idempotency-Key": key },
        data: {},
      })
    );
});

Then("the trip delete API responses are both {int}", async ({ page }, status: number) => {
  expect(state(page).responses.map((response) => response.status())).toEqual([status, status]);
});

Then("the delete API trip and its legacy documents are removed", async ({ page }) => {
  const current = state(page);
  const rows = await withE2EDb(async (database) => ({
    trips: await database.select().from(trips).where(eq(trips.id, current.tripId)),
    documents: await Promise.all(
      current.urls.map((url) => database.select().from(documents).where(eq(documents.url, url)))
    ),
    queued: await Promise.all(
      current.urls.map((url) => database.select().from(pendingFileDeletions).where(eq(pendingFileDeletions.url, url)))
    ),
  }));
  expect(rows.trips).toHaveLength(0);
  expect(rows.documents.flat()).toHaveLength(0);
  await expect
    .poll(async () => {
      const queued = await withE2EDb((database) =>
        Promise.all(
          current.urls.map((url) =>
            database.select().from(pendingFileDeletions).where(eq(pendingFileDeletions.url, url))
          )
        )
      );
      return queued.flat().length;
    })
    .toBe(0);
  for (const url of current.urls)
    await expect(access(join(resolve(E2E_STORAGE_DIRECTORY), url.slice("/api/storage/".length)))).rejects.toThrow();
});

When("I delete the trip concurrently through the API", async ({ page }) => {
  const current = state(page);
  const client = await apiClient(page);
  const headers = { "x-arrivo-client": "web", origin: new URL(page.url()).origin };
  current.responses = await Promise.all([
    client.delete(`/api/v1/trips/${current.tripId}`, { headers, data: {} }),
    client.delete(`/api/v1/trips/${current.tripId}`, { headers, data: {} }),
  ]);
});

After(async ({ page }) => {
  const current = states.get(page);
  if (current)
    for (const url of current.urls)
      await rm(join(resolve(E2E_STORAGE_DIRECTORY), url.slice("/api/storage/".length)), { force: true });
});
