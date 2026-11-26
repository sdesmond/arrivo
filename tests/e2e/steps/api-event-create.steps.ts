import { expect, type APIResponse, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { events } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { When, Then } from "../fixtures";
import { reloadPage } from "../page-reload";
import { dayOrderState, headers, state, storedDayOrder } from "../api-support";

// ── Event create API ────────────────────────────────────────────────────────
interface EventCreateState {
  response?: APIResponse;
  clientId?: string;
  retryBody?: Record<string, unknown>;
  keyedBodies: unknown[];
}
const eventCreateStates = new WeakMap<Page, EventCreateState>();
function eventCreateState(page: Page): EventCreateState {
  let current = eventCreateStates.get(page);
  if (!current) {
    current = { keyedBodies: [] };
    eventCreateStates.set(page, current);
  }
  return current;
}
async function postDayEvent(page: Page, body: unknown, options: { key?: string; dayId?: string } = {}) {
  const client = await apiClient(page);
  const response = await client.post(`/api/v1/days/${options.dayId ?? dayOrderState(page).dayId}/events`, {
    headers: options.key ? { ...headers(page), "idempotency-key": options.key } : headers(page),
    data: body,
  });
  eventCreateState(page).response = response;
  return response;
}
async function eventsNamed(dayId: string, name: string) {
  return withE2EDb((database) =>
    database
      .select({ id: events.id, position: events.position })
      .from(events)
      .where(and(eq(events.dayId, dayId), eq(events.name, name)))
  );
}
When("I create the event {string} after the first event through the day API", async ({ page }, name: string) => {
  await postDayEvent(page, { name, afterEventId: dayOrderState(page).original[0].id });
});
When(
  "I create the event {string} at position {int} through the day API",
  async ({ page }, name: string, position: number) => {
    await postDayEvent(page, { name, insertAtPosition: position });
  }
);
When("I create the event {string} at the end through the day API", async ({ page }, name: string) => {
  await postDayEvent(page, { name });
});
When("I create the event {string} on a day that no longer exists", async ({ page }, name: string) => {
  await postDayEvent(page, { name }, { dayId: randomUUID() });
});
Then("the event create API returns {int}", async ({ page }, status: number) => {
  const response = eventCreateState(page).response!;
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
});
Then("the event create API returns {int} with code {string}", async ({ page }, status: number, code: string) => {
  const response = eventCreateState(page).response!;
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const body = await response.json();
  expect(body.error.code).toBe(code);
  if (code === "validation_failed") expect(body.error.fields).toBeDefined();
  if (code === "forbidden") expect(body.error.requiredRole).toBe("editor");
});
Then("after reload the event {string} sits at timeline index {int}", async ({ page }, name: string, index: number) => {
  await reloadPage(page);
  const { dayId } = dayOrderState(page);
  const [row] = await eventsNamed(dayId, name);
  expect(row).toBeDefined();
  const order = await storedDayOrder(dayId);
  expect(order.findIndex((item) => item.type === "event" && item.id === row.id)).toBe(index);
});
When(
  "I create the event {string} with a client ID at position {int} through the day API",
  async ({ page }, name: string, position: number) => {
    const current = eventCreateState(page);
    current.clientId = randomUUID();
    current.retryBody = { id: current.clientId, name, insertAtPosition: position };
    const response = await postDayEvent(page, current.retryBody);
    expect(response.status()).toBe(200);
  }
);
When("I retry the client ID event creation", async ({ page }) => {
  await postDayEvent(page, eventCreateState(page).retryBody);
});
Then("the retried event keeps its shifted position and the day holds it once", async ({ page }) => {
  const { clientId, response } = eventCreateState(page);
  const { dayId, original } = dayOrderState(page);
  expect(response!.status()).toBe(200);
  // "Retry me" went in at 1, then "Shifter" at 1 pushed it to 2; the replay returns it as stored.
  expect(await response!.json()).toMatchObject({ id: clientId, name: "Retry me", dayId, position: 2 });
  const rows = await withE2EDb((database) =>
    database.select({ id: events.id, position: events.position }).from(events).where(eq(events.id, clientId!))
  );
  expect(rows).toEqual([{ id: clientId, position: 2 }]);
  expect(await storedDayOrder(dayId)).toHaveLength(original.length + 2);
});
When("I reuse the client ID for the event {string}", async ({ page }, name: string) => {
  await postDayEvent(page, { id: eventCreateState(page).clientId, name });
});
Then("the day holds the client ID event once", async ({ page }) => {
  const rows = await withE2EDb((database) =>
    database
      .select({ name: events.name })
      .from(events)
      .where(eq(events.id, eventCreateState(page).clientId!))
  );
  expect(rows).toEqual([{ name: "Retry me" }]);
});
When("I send the keyed event create {string} twice", async ({ page }, name: string) => {
  const current = eventCreateState(page);
  current.keyedBodies = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await postDayEvent(page, { name }, { key: state(page).key });
    expect(response.status()).toBe(200);
    current.keyedBodies.push(await response.json());
  }
});
Then("both keyed event creates return identical JSON naming {string}", async ({ page }, name: string) => {
  const [first, second] = eventCreateState(page).keyedBodies as { name: string }[];
  expect(second).toEqual(first);
  expect(first.name).toBe(name);
});
Then("the day holds {int} event(s) named {string}", async ({ page }, count: number, name: string) => {
  expect(await eventsNamed(dayOrderState(page).dayId, name)).toHaveLength(count);
});
When("I reuse the event create key with the name {string}", async ({ page }, name: string) => {
  await postDayEvent(page, { name }, { key: state(page).key });
});
When("I submit event create case {string}", async ({ page }, testCase: string) => {
  const unique = randomUUID();
  const bodies: Record<string, unknown> = {
    "blank-name": { name: "   " },
    "null-field": { name: "Valid", note: null },
    "unknown-key": { name: "Valid", position: 3 },
    "linked-event-id": { id: `linked-${unique}`, name: "Valid" },
    "linked-after-id": { name: "Valid", afterEventId: `linked-${unique}` },
    "negative-position": { name: "Valid", insertAtPosition: -1 },
  };
  await postDayEvent(
    page,
    bodies[testCase] ?? { name: "Valid" },
    testCase === "linked-day" ? { dayId: `linked-${unique}` } : {}
  );
});
