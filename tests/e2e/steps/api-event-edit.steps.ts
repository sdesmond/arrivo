import { expect, type APIResponse, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { days, events } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { Given, When, Then } from "../fixtures";
import { reloadPage } from "../page-reload";
import { headers } from "../api-support";

// ── Event edit API ──────────────────────────────────────────────────────────
interface EventApiState {
  ids: { scheduled: string; "day-less": string };
  response?: APIResponse;
  keyedBodies: unknown[];
  key: string;
}
const eventStates = new WeakMap<Page, EventApiState>();
function eventState(page: Page): EventApiState {
  const value = eventStates.get(page);
  if (!value) throw new Error("Event API fixture missing");
  return value;
}
function eventKind(kind: string): "scheduled" | "day-less" {
  if (kind !== "scheduled" && kind !== "day-less") throw new Error(`Unknown event kind "${kind}".`);
  return kind;
}
Given("scenario-owned scheduled and day-less events for the event API", async ({ page, scenario }) => {
  const tripId = scenario.currentTrip!.id;
  const ids = await withE2EDb(async (database) => {
    const [day] = await database
      .select({ id: days.id })
      .from(days)
      .where(and(eq(days.tripId, tripId), eq(days.dayNumber, 1)));
    const [scheduled] = await database
      .insert(events)
      .values({
        tripId,
        dayId: day.id,
        name: "API dinner",
        position: 10,
        startAt: new Date("2026-08-02T19:00:00.000Z"),
        locationName: "API bistro",
        locationAddress: "1 API St",
        note: "API note",
        confirmationNumber: "API123",
      })
      .returning({ id: events.id });
    const [dayLess] = await database
      .insert(events)
      .values({ tripId, dayId: null, name: "API floating", position: 0, note: "API float note" })
      .returning({ id: events.id });
    return { scheduled: scheduled.id, "day-less": dayLess.id };
  });
  eventStates.set(page, { ids, keyedBodies: [], key: `e2e-event-${randomUUID()}` });
});
function eventUrl(eventId: string) {
  return `/api/v1/events/${eventId}`;
}
When("I patch the {string} event through the event API with:", async ({ page }, kind: string, body: string) => {
  const current = eventState(page);
  current.response = await (
    await apiClient(page)
  ).patch(eventUrl(current.ids[eventKind(kind)]), {
    headers: headers(page),
    data: JSON.parse(body),
  });
});
When("I submit event API case {string}", async ({ page }, testCase: string) => {
  const current = eventState(page);
  const bodies: Record<string, unknown> = {
    "blank-name": { name: "   " },
    "null-name": { name: null },
    "bad-latitude": { locationLat: 91 },
    "unknown-key": { colour: "red" },
    "position-key": { position: 3 },
  };
  let eventId = current.ids.scheduled;
  if (testCase === "linked-id") eventId = `linked-${randomUUID()}`;
  if (testCase === "malformed-id") eventId = "not-a-uuid";
  current.response = await (
    await apiClient(page)
  ).patch(eventUrl(eventId), {
    headers: headers(page),
    data: bodies[testCase] ?? { name: "Valid name" },
  });
});
Then("the event API returns {int}", async ({ page }, status: number) => {
  const response = eventState(page).response!;
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
});
Then("the event API returns {int} with code {string}", async ({ page }, status: number, code: string) => {
  const response = eventState(page).response!;
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const body = await response.json();
  expect(body.error.code).toBe(code);
  if (code === "validation_failed") expect(body.error.fields).toBeDefined();
  if (code === "forbidden") expect(body.error.requiredRole).toBe("editor");
});
async function storedEvent(eventId: string) {
  const [row] = await withE2EDb((database) => database.select().from(events).where(eq(events.id, eventId)));
  return {
    name: row.name,
    note: row.note,
    dayId: row.dayId,
    startAt: row.startAt?.toISOString() ?? null,
    endAt: row.endAt?.toISOString() ?? null,
    locationName: row.locationName,
    locationAddress: row.locationAddress,
    locationLat: row.locationLat,
    locationLng: row.locationLng,
    confirmationNumber: row.confirmationNumber,
  };
}
Then("the {string} event is stored as:", async ({ page }, kind: string, expected: string) => {
  expect(await storedEvent(eventState(page).ids[eventKind(kind)])).toMatchObject(JSON.parse(expected));
});
Then("after reload the {string} event is stored as:", async ({ page }, kind: string, expected: string) => {
  await reloadPage(page);
  expect(await storedEvent(eventState(page).ids[eventKind(kind)])).toMatchObject(JSON.parse(expected));
});
When("I send the keyed {string} event edit {string} twice", async ({ page }, kind: string, name: string) => {
  const current = eventState(page);
  current.keyedBodies = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await (
      await apiClient(page)
    ).patch(eventUrl(current.ids[eventKind(kind)]), {
      headers: { ...headers(page), "idempotency-key": current.key },
      data: { name },
    });
    expect(response.status()).toBe(200);
    current.keyedBodies.push(await response.json());
  }
});
Then("both keyed event edits return identical JSON naming {string}", async ({ page }, name: string) => {
  const [first, second] = eventState(page).keyedBodies as { name: string }[];
  expect(second).toEqual(first);
  expect(first.name).toBe(name);
});
When("I reuse the event edit key with the name {string}", async ({ page }, name: string) => {
  const current = eventState(page);
  current.response = await (
    await apiClient(page)
  ).patch(eventUrl(current.ids.scheduled), {
    headers: { ...headers(page), "idempotency-key": current.key },
    data: { name },
  });
});
