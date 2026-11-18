import { expect, type APIResponse, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { collaborators } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { Given, Then, When } from "../fixtures";

interface LeaveApiState {
  tripId: string;
  /** Unique per scenario so keyed requests never collide across parallel workers. */
  keyPrefix: string;
  response?: APIResponse;
}

const states = new WeakMap<Page, LeaveApiState>();

function state(page: Page): LeaveApiState {
  const current = states.get(page);
  if (!current) throw new Error("Leave trip API fixture missing");
  return current;
}

function startState(page: Page, tripId: string): void {
  states.set(page, { tripId, keyPrefix: `leave-${randomUUID()}` });
}

Given("the shared trip for the leave trip API", async ({ page, scenario }) => {
  const trip = await scenario.ensureCurrentTrip();
  startState(page, trip.id);
});

Given("a trip I am not on for the leave trip API", async ({ page, scenario }) => {
  const { user: owner } = await scenario.materialize({ user: { setCurrent: false } });
  if (!owner) throw new Error("Leave trip API fixture owner missing");
  const { trip } = await scenario.materialize({ trip: { ownerId: owner.id, setCurrent: false } });
  if (!trip) throw new Error("Leave trip API fixture trip missing");
  startState(page, trip.id);
});

Given("a missing trip for the leave trip API", async ({ page }) => {
  startState(page, randomUUID());
});

When("I send the leave trip API request with {string} key", async ({ page }, key: string) => {
  const current = state(page);
  const client = await apiClient(page);
  current.response = await client.delete(`/api/v1/trips/${current.tripId}/collaborators/me`, {
    headers: {
      "x-arrivo-client": "web",
      "content-type": "application/json",
      origin: new URL(page.url()).origin,
      ...(key === "none" ? {} : { "Idempotency-Key": `${current.keyPrefix}-${key}` }),
    },
    data: {},
  });
});

When("I rejoin the leave trip API trip as an editor", async ({ page, scenario }) => {
  const current = state(page);
  const caller = await scenario.ensureCurrentUser();
  await withE2EDb((database) =>
    database.insert(collaborators).values({
      tripId: current.tripId,
      userId: caller.id,
      name: caller.name,
      initials: caller.initials,
      role: "editor",
      isCreator: false,
    })
  );
});

Then("the leave trip API returns an empty 204", async ({ page }) => {
  const { response } = state(page);
  expect(response!.status()).toBe(204);
  expect(response!.headers()["cache-control"]).toBe("no-store");
  expect(await response!.text()).toBe("");
});

Then("the leave trip API rejects with {int} and {string}", async ({ page }, status: number, code: string) => {
  const { response } = state(page);
  expect(response!.status()).toBe(status);
  expect((await response!.json()).error.code).toBe(code);
});

Then("the leave trip API message is {string}", async ({ page }, message: string) => {
  expect((await state(page).response!.json()).error.message).toBe(message);
});

Then("my membership on the leave trip API trip is {string}", async ({ page, scenario }, expected: string) => {
  const current = state(page);
  const caller = await scenario.ensureCurrentUser();
  const rows = await withE2EDb((database) =>
    database
      .select({ id: collaborators.id })
      .from(collaborators)
      .where(and(eq(collaborators.tripId, current.tripId), eq(collaborators.userId, caller.id)))
  );
  expect(rows).toHaveLength(expected === "present" ? 1 : 0);
});
