import { expect, type APIResponse, type Page } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { days, documents, events, pendingFileDeletions, trips } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { E2E_TRIP_FOURTH_DATE } from "../e2e-seed-data";
import { E2E_STORAGE_DIRECTORY } from "../../../scripts/e2e-storage.mjs";
import { apiClient } from "../anonymous-api";
import { Given, When, Then, After } from "../fixtures";
import { reloadPage } from "../page-reload";
import { StoredDay, fileExists, headers, state, storedDays } from "../api-support";

interface DayApiSnapshot {
  days: StoredDay[];
  endDate: string | null;
}
interface PopulatedDay {
  eventId: string;
  file: string;
}
interface DayApiState {
  tripId: string;
  /** The trip's days and end date as seeded, or as last reseeded by a Given, for the "unchanged" assertions. */
  before: DayApiSnapshot;
  response?: APIResponse;
  responses: APIResponse[];
  clientId?: string;
  retryBody?: Record<string, unknown>;
  populated?: PopulatedDay;
}
const dayApiStates = new WeakMap<Page, DayApiState>();
function dayApi(page: Page): DayApiState {
  const value = dayApiStates.get(page);
  if (!value) throw new Error("Day API fixture missing");
  return value;
}
async function daySnapshot(tripId: string): Promise<DayApiSnapshot> {
  const [trip] = await withE2EDb((database) =>
    database.select({ endDate: trips.endDate }).from(trips).where(eq(trips.id, tripId))
  );
  return { days: await storedDays(tripId), endDate: trip.endDate };
}
const DAY_ORDINALS: Record<string, number> = { first: 0, second: 1, third: 2, last: 2 };
function dayIdAt(page: Page, which: string): string {
  // "last" and "third" name the same day of the three-day trip.
  const day = dayApi(page).before.days[DAY_ORDINALS[which] ?? -1];
  if (!day) throw new Error(`The trip holds no ${which} day.`);
  return day.id;
}
async function sendDay(
  page: Page,
  method: "post" | "patch" | "delete",
  url: string,
  body: unknown,
  key?: string
): Promise<APIResponse> {
  const client = await apiClient(page);
  const response = await client[method](url, {
    headers: key ? { ...headers(page), "idempotency-key": key } : headers(page),
    data: body,
  });
  const current = dayApi(page);
  current.response = response;
  current.responses.push(response);
  return response;
}
function patchDay(page: Page, dayId: string, body: unknown, key?: string) {
  return sendDay(page, "patch", `/api/v1/days/${dayId}`, body, key);
}
function postDay(page: Page, body: unknown, key?: string) {
  return sendDay(page, "post", `/api/v1/trips/${dayApi(page).tripId}/days`, body, key);
}
function deleteDay(page: Page, dayId: string, body: unknown, key?: string) {
  return sendDay(page, "delete", `/api/v1/days/${dayId}`, body, key);
}
async function reseedDaySnapshot(page: Page): Promise<void> {
  const current = dayApi(page);
  current.before = await daySnapshot(current.tripId);
}
Given("scenario-owned days for the day API", async ({ page, scenario }) => {
  const tripId = scenario.currentTrip!.id;
  const before = await daySnapshot(tripId);
  // The threeDayTrip mother: three dated days, the last one empty.
  expect(before.days.map((day) => day.dayNumber)).toEqual([1, 2, 3]);
  expect(before.endDate).toBe(before.days[2].date);
  dayApiStates.set(page, { tripId, before, responses: [] });
});
Given("the last day holds an event with a document file for the day API", async ({ page }) => {
  const current = dayApi(page);
  const storageRoot = resolve(E2E_STORAGE_DIRECTORY);
  const lastDayId = current.before.days[2].id;
  const [event] = await withE2EDb((database) =>
    database
      .insert(events)
      .values({ tripId: current.tripId, dayId: lastDayId, name: "API day event", position: 0 })
      .returning({ id: events.id })
  );
  const file = `event-documents/${event.id}/${randomUUID()}.pdf`;
  await mkdir(join(storageRoot, "event-documents", event.id), { recursive: true });
  await writeFile(join(storageRoot, file), "day");
  await withE2EDb((database) =>
    database.insert(documents).values({
      tripId: current.tripId,
      eventId: event.id,
      name: "API day doc",
      kind: "pdf",
      size: "1",
      url: `/api/storage/${file}`,
    })
  );
  current.populated = { eventId: event.id, file };
});
After(async ({ page }) => {
  const populated = dayApiStates.get(page)?.populated;
  if (populated) await rm(join(resolve(E2E_STORAGE_DIRECTORY), populated.file), { force: true });
});
Given("the trip holds {int} days for the day API", async ({ page }, count: number) => {
  const current = dayApi(page);
  const existing = current.before.days.length;
  await withE2EDb((database) =>
    database.insert(days).values(
      Array.from({ length: count - existing }, (_unused, index) => ({
        tripId: current.tripId,
        dayNumber: existing + index + 1,
        date: null,
        label: `Day ${existing + index + 1}`,
      }))
    )
  );
  await reseedDaySnapshot(page);
  expect(current.before.days).toHaveLength(count);
});
Given("the trip holds only its first day for the day API", async ({ page }) => {
  const current = dayApi(page);
  await withE2EDb((database) =>
    database.delete(days).where(
      and(
        eq(days.tripId, current.tripId),
        inArray(
          days.id,
          current.before.days.slice(1).map((day) => day.id)
        )
      )
    )
  );
  await reseedDaySnapshot(page);
  expect(current.before.days).toHaveLength(1);
});
Then("the day API returns {int}", async ({ page }, status: number) => {
  const response = dayApi(page).response!;
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
});
Then("the day API returns {int} with code {string}", async ({ page }, status: number, code: string) => {
  const response = dayApi(page).response!;
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const body = await response.json();
  expect(body.error.code).toBe(code);
  if (code === "validation_failed") expect(body.error.fields ?? body.error.message).toBeDefined();
  if (code === "forbidden") expect(body.error.requiredRole).toBe("editor");
});
Then("the day API error message is {string}", async ({ page }, message: string) => {
  expect((await dayApi(page).response!.json()).error.message).toBe(message);
});
Then("the stored days keep their original state", async ({ page }) => {
  const { tripId, before } = dayApi(page);
  expect(await daySnapshot(tripId)).toEqual(before);
});
When("I patch the {word} day through the day API with:", async ({ page }, which: string, body: string) => {
  await patchDay(page, dayIdAt(page, which), JSON.parse(body));
});
When("I patch a day that does not exist through the day API", async ({ page }) => {
  await patchDay(page, randomUUID(), { label: "Ghost" });
});
When("I send the keyed day edit {string} twice", async ({ page }, label: string) => {
  dayApi(page).responses = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    expect((await patchDay(page, dayIdAt(page, "second"), { label }, state(page).key)).status()).toBe(200);
  }
});
When("I reuse the day edit key with the label {string}", async ({ page }, label: string) => {
  await patchDay(page, dayIdAt(page, "second"), { label }, state(page).key);
});
When("I submit day edit case {string}", async ({ page }, testCase: string) => {
  const dayId = dayIdAt(page, "second");
  const requests: Record<string, { id: string; body: unknown }> = {
    "null-label": { id: dayId, body: { label: null } },
    "over-long-label": { id: dayId, body: { label: "x".repeat(101) } },
    "over-long-subtitle": { id: dayId, body: { subtitle: "x".repeat(301) } },
    "non-text-weather": { id: dayId, body: { weather: 5 } },
    "unknown-key": { id: dayId, body: { label: "Valid", dayNumber: 9 } },
    "malformed-id": { id: "not-a-uuid", body: { label: "Valid" } },
  };
  const request = requests[testCase];
  await patchDay(page, request.id, request.body);
});
Then("after reload the {word} day is stored as:", async ({ page }, which: string, expected: string) => {
  await reloadPage(page);
  const row = (await storedDays(dayApi(page).tripId)).find((day) => day.id === dayIdAt(page, which));
  expect(row).toMatchObject(JSON.parse(expected));
});
Then("the day API response is the {word} day as stored", async ({ page }, which: string) => {
  const body = await dayApi(page).response!.json();
  const stored = (await storedDays(dayApi(page).tripId)).find((day) => day.id === dayIdAt(page, which))!;
  expect(body).toMatchObject({
    id: stored.id,
    dayNumber: stored.dayNumber,
    label: stored.label,
    ...(stored.subtitle ? { subtitle: stored.subtitle } : {}),
  });
});
When("I append a day through the day API", async ({ page }) => {
  await postDay(page, {});
});
When("I append a day with a client ID through the day API", async ({ page }) => {
  const current = dayApi(page);
  current.clientId = randomUUID();
  current.retryBody = { id: current.clientId };
  expect((await postDay(page, current.retryBody)).status()).toBe(200);
});
When("I retry the client ID day append", async ({ page }) => {
  await postDay(page, dayApi(page).retryBody);
});
Then("the appended day follows the last date and the trip ends on it", async ({ page }) => {
  const { tripId } = dayApi(page);
  const snapshot = await daySnapshot(tripId);
  expect(snapshot.days).toHaveLength(4);
  expect(snapshot.days[3]).toMatchObject({ dayNumber: 4, date: E2E_TRIP_FOURTH_DATE, label: "Day 4" });
  expect(snapshot.endDate).toBe(E2E_TRIP_FOURTH_DATE);
});
Then("the retry returns the stored day and the trip holds it once", async ({ page }) => {
  const { clientId, response, tripId } = dayApi(page);
  expect(response!.status()).toBe(200);
  expect(await response!.json()).toMatchObject({ id: clientId, tripId, dayNumber: 4, date: E2E_TRIP_FOURTH_DATE });
  const rows = await storedDays(tripId);
  expect(rows).toHaveLength(4);
  expect(rows.filter((day) => day.id === clientId)).toHaveLength(1);
});
When("I send the keyed day append twice", async ({ page }) => {
  const current = dayApi(page);
  current.responses = [];
  current.clientId = randomUUID();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    expect((await postDay(page, { id: current.clientId }, state(page).key)).status()).toBe(200);
  }
});
Then("both keyed day requests return identical JSON for the client ID day", async ({ page }) => {
  const { responses, clientId } = dayApi(page);
  const [first, second] = await Promise.all(responses.map((response) => response.json()));
  expect(second).toEqual(first);
  expect(first.id).toBe(clientId);
});
When("I reuse the day append key without a client ID", async ({ page }) => {
  await postDay(page, {}, state(page).key);
});
Then("the trip holds {int} days", async ({ page }, count: number) => {
  expect(await storedDays(dayApi(page).tripId)).toHaveLength(count);
});
When("I submit day append case {string}", async ({ page }, testCase: string) => {
  const bodies: Record<string, unknown> = {
    "malformed-id": { id: "not-a-uuid" },
    "unknown-key": { label: "Day 4" },
    "date-key": { date: "2030-01-01" },
  };
  await postDay(page, bodies[testCase]);
});
When("I delete the last day through the day API confirming the destructive removal", async ({ page }) => {
  await deleteDay(page, dayIdAt(page, "third"), { tripId: dayApi(page).tripId, confirmDestructive: true });
});
When("I delete the {word} day through the day API", async ({ page }, which: string) => {
  await deleteDay(page, dayIdAt(page, which), { tripId: dayApi(page).tripId });
});
When("I send the keyed day delete twice", async ({ page }) => {
  dayApi(page).responses = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await deleteDay(page, dayIdAt(page, "third"), { tripId: dayApi(page).tripId }, state(page).key);
  }
});
When("I submit day delete case {string}", async ({ page }, testCase: string) => {
  const dayId = dayIdAt(page, "third");
  const { tripId } = dayApi(page);
  const requests: Record<string, { id: string; body: unknown }> = {
    "missing-trip": { id: dayId, body: {} },
    "malformed-id": { id: "not-a-uuid", body: { tripId } },
    "unknown-key": { id: dayId, body: { tripId, force: true } },
    "bad-confirmation": { id: dayId, body: { tripId, confirmDestructive: "yes" } },
  };
  const request = requests[testCase];
  await deleteDay(page, request.id, request.body);
});
Then("both keyed day deletes return 204", async ({ page }) => {
  const { responses } = dayApi(page);
  expect(responses).toHaveLength(2);
  for (const response of responses) expect(response.status()).toBe(204);
});
Then("the last day is gone and the trip ends on the second day's date", async ({ page }) => {
  await reloadPage(page);
  const { tripId, before } = dayApi(page);
  const snapshot = await daySnapshot(tripId);
  expect(snapshot.days.map((day) => day.id)).toEqual(before.days.slice(0, 2).map((day) => day.id));
  expect(snapshot.endDate).toBe(before.days[1].date);
});
Then("the populated last day, its event, document and file are gone", async ({ page }) => {
  await reloadPage(page);
  const { tripId, before, populated } = dayApi(page);
  expect((await storedDays(tripId)).map((day) => day.id)).toEqual(before.days.slice(0, 2).map((day) => day.id));
  const [eventRows, documentRows, queued] = await withE2EDb((database) =>
    Promise.all([
      database.select({ id: events.id }).from(events).where(eq(events.id, populated!.eventId)),
      database.select({ id: documents.id }).from(documents).where(eq(documents.eventId, populated!.eventId)),
      database
        .select({ id: pendingFileDeletions.id })
        .from(pendingFileDeletions)
        .where(eq(pendingFileDeletions.url, `/api/storage/${populated!.file}`)),
    ])
  );
  expect(eventRows).toHaveLength(0);
  expect(documentRows).toHaveLength(0);
  expect(await fileExists(join(resolve(E2E_STORAGE_DIRECTORY), populated!.file))).toBe(false);
  expect(queued).toHaveLength(0);
});
Then("the populated last day, its event and its file are untouched", async ({ page }) => {
  const { tripId, before, populated } = dayApi(page);
  expect(await daySnapshot(tripId)).toEqual(before);
  const eventRows = await withE2EDb((database) =>
    database.select({ id: events.id }).from(events).where(eq(events.id, populated!.eventId))
  );
  expect(eventRows).toHaveLength(1);
  expect(await fileExists(join(resolve(E2E_STORAGE_DIRECTORY), populated!.file))).toBe(true);
});
