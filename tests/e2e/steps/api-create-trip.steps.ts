import { expect, type APIResponse, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { collaborators, days, trips } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { Given, Then, When } from "../fixtures";

interface CreateTripState {
  tripId: string;
  name: string;
  responses: APIResponse[];
  listed?: { trip: { id: string; status: string; name: string } }[];
  others: { owned?: string; shared?: string; unrelated?: string };
}
const states = new WeakMap<Page, CreateTripState>();

function state(page: Page): CreateTripState {
  const current = states.get(page);
  if (!current) throw new Error("Create trip API state missing");
  return current;
}
function headers(page: Page, extra: Record<string, string> = {}) {
  return {
    "x-arrivo-client": "web",
    "content-type": "application/json",
    origin: new URL(page.url()).origin,
    ...extra,
  };
}
async function postTrip(page: Page, data: Record<string, unknown>, key?: string): Promise<APIResponse> {
  const response = await (
    await apiClient(page)
  ).post("/api/v1/trips", { headers: headers(page, key ? { "Idempotency-Key": key } : {}), data });
  state(page).responses.push(response);
  return response;
}

Given("a new trip id and name for the create trip API", async ({ page, scenario }) => {
  states.set(page, { tripId: randomUUID(), name: scenario.uniqueName("API Created"), responses: [], others: {} });
});

When(
  "I create the trip through the API with keys {string} and {string}",
  async ({ page }, firstKey: string, secondKey: string) => {
    const current = state(page);
    const data = { id: current.tripId, name: current.name, startDate: "2031-03-01", endDate: "2031-03-03" };
    const suffix = randomUUID();
    await postTrip(page, data, firstKey === "none" ? undefined : `${firstKey}-${suffix}`);
    await postTrip(page, data, secondKey === "none" ? undefined : `${secondKey}-${suffix}`);
  }
);

When("I create the trip through the API under another name", async ({ page }) => {
  const current = state(page);
  await postTrip(page, { id: current.tripId, name: current.name });
  await postTrip(page, { id: current.tripId, name: `${current.name} renamed` });
});

When("I create a trip through the API spanning {int} days", async ({ page }, count: number) => {
  const current = state(page);
  const end = new Date(Date.UTC(2031, 0, 1) + (count - 1) * 86_400_000).toISOString().slice(0, 10);
  await postTrip(page, { id: current.tripId, name: current.name, startDate: "2031-01-01", endDate: end });
});

When("I create a trip through the API ending before it starts", async ({ page }) => {
  const current = state(page);
  await postTrip(page, { id: current.tripId, name: current.name, startDate: "2031-02-10", endDate: "2031-02-01" });
});

Given("a trip owned by someone else that I cannot see", async ({ page, scenario }) => {
  const { user: owner } = await scenario.materialize({ user: { setCurrent: false } });
  const { trip } = await scenario.materialize({ trip: { ownerId: owner!.id, setCurrent: false } });
  const current = state(page);
  current.tripId = trip!.id;
  current.name = trip!.name;
});

When("I create a trip through the API with that id", async ({ page }) => {
  const current = state(page);
  await postTrip(page, { id: current.tripId, name: current.name });
});

Given("a trip owned by someone else that is shared with me and one that is not", async ({ page, scenario }) => {
  const me = await scenario.ensureCurrentUser();
  const { user: owner } = await scenario.materialize({ user: { setCurrent: false } });
  const { trip: shared } = await scenario.materialize({ trip: { ownerId: owner!.id, setCurrent: false } });
  const { trip: unrelated } = await scenario.materialize({ trip: { ownerId: owner!.id, setCurrent: false } });
  await withE2EDb((database) =>
    database.insert(collaborators).values({
      tripId: shared!.id,
      userId: me.id,
      name: me.name,
      initials: me.initials,
      role: "viewer",
      isCreator: false,
    })
  );
  states.set(page, {
    tripId: randomUUID(),
    name: "",
    responses: [],
    others: { owned: scenario.currentTrip?.id, shared: shared!.id, unrelated: unrelated!.id },
  });
});

When("I list my trips through the API", async ({ page }) => {
  const current = state(page);
  const response = await (await apiClient(page)).get("/api/v1/trips", { headers: headers(page) });
  current.responses.push(response);
  if (response.status() === 200) current.listed = (await response.json()).trips;
});

Then("both create trip API responses return the same trip", async ({ page }) => {
  const current = state(page);
  expect(current.responses.map((response) => response.status())).toEqual([200, 200]);
  const [first, second] = await Promise.all(current.responses.map((response) => response.json()));
  expect(first.id).toBe(current.tripId);
  expect(second.id).toBe(current.tripId);
  expect(first.name).toBe(current.name);
  expect(current.responses[0].headers()["cache-control"]).toBe("no-store");
});

Then("the create trip API stored one trip with three days", async ({ page }) => {
  const { tripId } = state(page);
  const rows = await withE2EDb(async (database) => ({
    trips: await database.select({ id: trips.id }).from(trips).where(eq(trips.id, tripId)),
    days: await database.select({ id: days.id }).from(days).where(eq(days.tripId, tripId)),
  }));
  expect(rows.trips).toHaveLength(1);
  expect(rows.days).toHaveLength(3);
});

Then("the created trip has one graphic cover", async ({ page }) => {
  const { tripId } = state(page);
  const [row] = await withE2EDb((database) =>
    database.select({ cover: trips.coverImageUrl }).from(trips).where(eq(trips.id, tripId))
  );
  expect(row.cover).toBeTruthy();
  const retried = await state(page).responses.at(-1)!.json();
  expect(retried.coverImageUrl).toBe(row.cover);
});

Then("the create trip API answers {int} with code {string}", async ({ page }, status: number, code: string) => {
  const response = state(page).responses.at(-1)!;
  expect(response.status()).toBe(status);
  expect((await response.json()).error.code).toBe(code);
});

Then("the create trip API wrote nothing new", async ({ page }) => {
  const { tripId, name } = state(page);
  const rows = await withE2EDb((database) =>
    database.select({ id: trips.id, name: trips.name }).from(trips).where(eq(trips.id, tripId))
  );
  // A foreign id keeps its original row; a rejected new id leaves none.
  expect(rows.every((row) => row.name === name)).toBe(true);
  expect(rows.length).toBeLessThanOrEqual(1);
});

Then("my trip list holds my trip and the shared trip but not the other one", async ({ page }) => {
  const current = state(page);
  expect(current.responses.at(-1)!.status()).toBe(200);
  const ids = (current.listed ?? []).map((entry) => entry.trip.id);
  expect(ids).toContain(current.others.owned);
  expect(ids).toContain(current.others.shared);
  expect(ids).not.toContain(current.others.unrelated);
  for (const entry of current.listed ?? []) expect(["active", "upcoming", "past"]).toContain(entry.trip.status);
});

Then("the created trip is listed once", async ({ page }) => {
  const current = state(page);
  const matching = (current.listed ?? []).filter((entry) => entry.trip.id === current.tripId);
  expect(matching).toHaveLength(1);
});
