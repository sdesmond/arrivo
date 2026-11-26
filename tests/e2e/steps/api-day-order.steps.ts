import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { itineraryChecklists, days, events, itineraryNotes } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { Given, When, Then } from "../fixtures";
import { reloadPage } from "../page-reload";
import {
  DayItem,
  dayOrderState,
  dayOrderStates,
  headers,
  state,
  storedDayOrder,
  timelineSnapshot,
} from "../api-support";

Given("the mixed day for the day order API", async ({ page, scenario }) => {
  const tripId = scenario.currentTrip!.id;
  const [dayOne, dayTwo] = await withE2EDb((database) =>
    database.select({ id: days.id }).from(days).where(eq(days.tripId, tripId)).orderBy(days.dayNumber)
  );
  const original = await storedDayOrder(dayOne.id);
  const [foreign] = await storedDayOrder(dayTwo.id);
  // The foreign-item cases borrow a day 2 item; an empty day 2 would send malformed bodies, not 409 cases.
  expect(foreign).toBeDefined();
  // The API fixture holds an event, a note and a checklist on day 1, plus a second event: four mixed items.
  expect(original.map((item) => item.type)).toEqual(["event", "note", "checklist", "event"]);
  dayOrderStates.set(page, { tripId, dayId: dayOne.id, original, foreign, key: `e2e-day-order-${randomUUID()}` });
});
async function putDayOrder(page: Page, items: DayItem[], key?: string) {
  const current = dayOrderState(page);
  const client = await apiClient(page);
  current.response = await client.put(`/api/v1/days/${current.dayId}/order`, {
    headers: key ? { ...headers(page), "idempotency-key": key } : headers(page),
    data: { items },
  });
}
When("I PUT the reversed day order", async ({ page }) => {
  await putDayOrder(page, [...dayOrderState(page).original].reverse());
});
When("I PUT the reversed day order with an Idempotency-Key", async ({ page }) => {
  const current = dayOrderState(page);
  await putDayOrder(page, [...current.original].reverse(), current.key);
});
When("I PUT the stored day order", async ({ page }) => {
  await putDayOrder(page, dayOrderState(page).original);
});
When("I PUT the original day order with the same Idempotency-Key", async ({ page }) => {
  const current = dayOrderState(page);
  await putDayOrder(page, current.original, current.key);
});
When("I PUT the day order case {string}", async ({ page }, testCase: string) => {
  const { original, foreign } = dayOrderState(page);
  const cases: Record<string, DayItem[]> = {
    "missing-item": original.slice(0, -1),
    "extra-item": [...original, foreign],
    "foreign-item": [...original.slice(0, -1), foreign],
    "wrong-type": [{ ...original[0], type: "note" }, ...original.slice(1)],
    duplicate: [...original, original[0]],
  };
  await putDayOrder(page, cases[testCase]);
});
When("another editor stores the original day order directly", async ({ page }) => {
  const { original } = dayOrderState(page);
  await withE2EDb(async (database) => {
    for (const [index, item] of original.entries()) {
      const table = { event: events, note: itineraryNotes, checklist: itineraryChecklists }[item.type];
      await database.update(table).set({ position: index }).where(eq(table.id, item.id));
    }
  });
});
When("I retry the same keyed day order PUT", async ({ page }) => {
  const current = dayOrderState(page);
  await putDayOrder(page, [...current.original].reverse(), current.key);
});
Then("the day order API returns {int}", async ({ page }, status: number) => {
  const response = dayOrderState(page).response!;
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
});
Then("the day order API returns {int} with code {string}", async ({ page }, status: number, code: string) => {
  const response = dayOrderState(page).response!;
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const body = await response.json();
  expect(body.error.code).toBe(code);
  if (code === "validation_failed") expect(body.error.fields).toBeDefined();
  if (code === "forbidden") expect(body.error.requiredRole).toBe("editor");
});
Then("the day order API response lists the reversed order", async ({ page }) => {
  const current = dayOrderState(page);
  expect(await current.response!.json()).toEqual({ dayId: current.dayId, items: [...current.original].reverse() });
});
Then("after reload the day stores the reversed order", async ({ page }) => {
  const current = dayOrderState(page);
  await reloadPage(page);
  expect(await storedDayOrder(current.dayId)).toEqual([...current.original].reverse());
});
Then("the day stores the original order", async ({ page }) => {
  const current = dayOrderState(page);
  expect(await storedDayOrder(current.dayId)).toEqual(current.original);
});
Then("the untouched day is unchanged", async ({ page }) => {
  const untouched = state(page).untouchedDay!;
  expect(await timelineSnapshot(untouched.dayId)).toEqual(untouched.before);
});
