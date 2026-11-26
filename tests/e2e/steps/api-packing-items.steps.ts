import { expect, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { packingItems } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { Given, When, Then } from "../fixtures";
import { headers, state, states } from "../api-support";

Given("a scenario-owned packing API item", async ({ page, scenario }) => {
  const result = await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        packingLists: [
          {
            name: "API list",
            position: 0,
            items: [
              { name: "API socks", done: false, isLabel: false, position: 0 },
              { name: "API hat", done: false, isLabel: false, position: 1 },
            ],
          },
        ],
      },
      setCurrent: true,
    },
  });
  if (!result.trip) throw new Error("Packing API trip missing");
  const [item] = await withE2EDb((database) =>
    database
      .select({ id: packingItems.id })
      .from(packingItems)
      .where(and(eq(packingItems.tripId, result.trip!.id), eq(packingItems.name, "API socks")))
  );
  const unique = randomUUID();
  states.set(page, { itemId: item.id, key: `packing-${unique}`, suffix: unique.replaceAll("-", ""), responses: [] });
  await scenario.signIn(page);
  await scenario.gotoCurrentTrip(page);
});
function packingApiUrl(page: Page): string {
  return `/api/v1/packing-items/${state(page).itemId}`;
}
When("I repeat packing item edits and deletes through the API", async ({ page, scenario }) => {
  const client = await apiClient(page);
  for (const keyed of [false, true, true, false]) {
    const response = await client.patch(packingApiUrl(page), {
      headers: { ...headers(page), ...(keyed ? { "Idempotency-Key": state(page).key } : {}) },
      data: { name: " API boots ", isPacked: true },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ name: "API boots", done: true });
  }
  const tripId = scenario.currentTrip!.id;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await client.delete(packingApiUrl(page), { headers: headers(page), data: { tripId } });
    expect(response.status()).toBe(204);
  }
});
Then("the deleted packing item is absent", async ({ page }) => {
  const rows = await withE2EDb((database) =>
    database
      .select()
      .from(packingItems)
      .where(eq(packingItems.id, state(page).itemId))
  );
  expect(rows).toHaveLength(0);
});
When("I commit a keyed packing item edit", async ({ page }) => {
  const response = await (
    await apiClient(page)
  ).patch(packingApiUrl(page), {
    headers: { ...headers(page), "Idempotency-Key": state(page).key },
    data: { isPacked: true },
  });
  expect(response.status()).toBe(200);
});
When("I retry the keyed packing item edit and attempt a delete", async ({ page, scenario }) => {
  const client = await apiClient(page);
  const patch = await client.patch(packingApiUrl(page), {
    headers: { ...headers(page), "Idempotency-Key": state(page).key },
    data: { isPacked: true },
  });
  const deletion = await client.delete(packingApiUrl(page), {
    headers: headers(page),
    data: { tripId: scenario.currentTrip!.id },
  });
  state(page).responses = [
    { status: patch.status(), body: await patch.json() },
    { status: deletion.status(), body: await deletion.json() },
  ];
});
Then("the packing API denies both writes with {int} and preserves the item", async ({ page }, status: number) => {
  expect(state(page).responses.map((response) => response.status)).toEqual([status, status]);
  const [item] = await withE2EDb((database) =>
    database
      .select()
      .from(packingItems)
      .where(eq(packingItems.id, state(page).itemId))
  );
  expect(item).toMatchObject({ name: "API socks", done: true });
});
When("I commit a keyed packing item deletion", async ({ page, scenario }) => {
  const response = await (
    await apiClient(page)
  ).delete(packingApiUrl(page), {
    headers: { ...headers(page), "Idempotency-Key": state(page).key },
    data: { tripId: scenario.currentTrip!.id },
  });
  expect(response.status()).toBe(204);
});
When("I retry the keyed packing item deletion", async ({ page, scenario }) => {
  state(page).response = await (
    await apiClient(page)
  ).delete(packingApiUrl(page), {
    headers: { ...headers(page), "Idempotency-Key": state(page).key },
    data: { tripId: scenario.currentTrip!.id },
  });
});
Then("the keyed packing deletion is denied with {int}", async ({ page }, status: number) => {
  expect(state(page).response!.status()).toBe(status);
  const rows = await withE2EDb((database) =>
    database
      .select()
      .from(packingItems)
      .where(eq(packingItems.id, state(page).itemId))
  );
  expect(rows).toHaveLength(0);
});
When("I delete a packing item twice with a key and reuse it on another item", async ({ page, scenario }) => {
  const client = await apiClient(page);
  const tripId = scenario.currentTrip!.id;
  const options = { headers: { ...headers(page), "Idempotency-Key": state(page).key }, data: { tripId } };
  const first = await client.delete(packingApiUrl(page), options);
  const replay = await client.delete(packingApiUrl(page), options);
  const [other] = await withE2EDb((database) =>
    database
      .select({ id: packingItems.id })
      .from(packingItems)
      .where(and(eq(packingItems.tripId, tripId), eq(packingItems.name, "API hat")))
  );
  const conflict = await client.delete(`/api/v1/packing-items/${other.id}`, options);
  state(page).responses = [first, replay, conflict].map((response) => ({ status: response.status(), body: null }));
});
Then("the keyed packing deletion replays and the other item remains", async ({ page, scenario }) => {
  expect(state(page).responses.map((response) => response.status)).toEqual([204, 204, 409]);
  const items = await withE2EDb((database) =>
    database.select().from(packingItems).where(eq(packingItems.tripId, scenario.currentTrip!.id))
  );
  expect(items.map((item) => item.name)).toEqual(["API hat"]);
});
