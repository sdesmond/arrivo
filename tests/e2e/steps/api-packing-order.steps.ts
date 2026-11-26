import { expect, type APIResponse, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { packingItems, tripPackingLists } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { Given, When, Then } from "../fixtures";
import { headers, scopedPackingState, scopedPackingStates, storedScopedPacking } from "../api-support";

interface PackingOrderState {
  tripId: string;
  ids: string[];
  response?: APIResponse;
}
const packingOrderStates = new WeakMap<Page, PackingOrderState>();
function packingOrderState(page: Page): PackingOrderState {
  const value = packingOrderStates.get(page);
  if (!value) throw new Error("Packing order API fixture missing");
  return value;
}
async function storedPackingOrder(tripId: string): Promise<string[]> {
  const rows = await withE2EDb((database) =>
    database
      .select({ id: packingItems.id })
      .from(packingItems)
      .where(eq(packingItems.tripId, tripId))
      .orderBy(packingItems.position)
  );
  return rows.map((row) => row.id);
}
Given("scenario-owned packing items for the packing order API", async ({ page, scenario }) => {
  const tripId = scenario.currentTrip!.id;
  const rows = await withE2EDb((database) =>
    database
      .insert(packingItems)
      .values(["Socks", "Hat", "Boots"].map((name, position) => ({ tripId, name, position, done: false })))
      .returning({ id: packingItems.id, position: packingItems.position })
  );
  const ids = rows.sort((left, right) => left.position - right.position).map((row) => row.id);
  packingOrderStates.set(page, { tripId, ids });
});
async function putPackingOrder(page: Page, ids: string[]) {
  const current = packingOrderState(page);
  const client = await apiClient(page);
  current.response = await client.put(`/api/v1/trips/${current.tripId}/packing/order`, {
    headers: headers(page),
    data: { listId: null, items: ids.map((id) => ({ id, labelId: null })) },
  });
}
When("I PUT the reversed packing order", async ({ page }) => {
  await putPackingOrder(page, [...packingOrderState(page).ids].reverse());
});
When("I PUT the packing order case {string}", async ({ page }, testCase: string) => {
  const { ids } = packingOrderState(page);
  const cases: Record<string, string[]> = {
    partial: ids.slice(0, -1),
    extra: [...ids, randomUUID()],
    foreign: [...ids.slice(0, -1), randomUUID()],
  };
  await putPackingOrder(page, cases[testCase]);
});
Then("the packing order API returns {int}", async ({ page }, status: number) => {
  const response = packingOrderState(page).response!;
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
});
Then("the packing order API returns {int} with code {string}", async ({ page }, status: number, code: string) => {
  const response = packingOrderState(page).response!;
  expect(response.status()).toBe(status);
  expect((await response.json()).error.code).toBe(code);
});
Then("the packing order stays as seeded", async ({ page }) => {
  const { tripId, ids } = packingOrderState(page);
  expect(await storedPackingOrder(tripId)).toEqual(ids);
});
Then("the packing order is stored reversed", async ({ page }) => {
  const { tripId, ids } = packingOrderState(page);
  expect(await storedPackingOrder(tripId)).toEqual([...ids].reverse());
});
Given(
  "scenario-owned default-list and named-list packing items for the packing order API",
  async ({ page, scenario }) => {
    const tripId = scenario.currentTrip!.id;
    const { listId, listIds, defaultId } = await withE2EDb(async (database) => {
      const [list] = await database
        .insert(tripPackingLists)
        .values({ tripId, name: "Scoped list", position: 0 })
        .returning({ id: tripPackingLists.id });
      const named = await database
        .insert(packingItems)
        .values(
          ["Scoped A", "Scoped B"].map((name, position) => ({ tripId, listId: list.id, name, position, done: false }))
        )
        .returning({ id: packingItems.id, position: packingItems.position });
      const [defaultItem] = await database
        .insert(packingItems)
        .values({ tripId, listId: null, name: "Default only", position: 7, done: false })
        .returning({ id: packingItems.id });
      return {
        listId: list.id,
        listIds: named.sort((left, right) => left.position - right.position).map((row) => row.id),
        defaultId: defaultItem.id,
      };
    });
    scopedPackingStates.set(page, { tripId, listId, listIds, defaultId });
  }
);
async function putScopedPackingOrder(page: Page, ids: string[]) {
  const current = scopedPackingState(page);
  const client = await apiClient(page);
  current.response = await client.put(`/api/v1/trips/${current.tripId}/packing/order`, {
    headers: headers(page),
    data: { listId: current.listId, items: ids.map((id) => ({ id, labelId: null })) },
  });
}
When("I PUT the named packing list order including the default-list item", async ({ page }) => {
  const current = scopedPackingState(page);
  await putScopedPackingOrder(page, [...current.listIds, current.defaultId]);
});
When("I PUT the reversed named packing list order", async ({ page }) => {
  await putScopedPackingOrder(page, [...scopedPackingState(page).listIds].reverse());
});
Then("the scoped packing order API returns {int}", async ({ page }, status: number) => {
  expect(scopedPackingState(page).response!.status()).toBe(status);
});
Then("the named packing list keeps its seeded order", async ({ page }) => {
  const current = scopedPackingState(page);
  expect((await storedScopedPacking(current)).named).toEqual(current.listIds);
});
Then("the named packing list is stored reversed", async ({ page }) => {
  const current = scopedPackingState(page);
  expect((await storedScopedPacking(current)).named).toEqual([...current.listIds].reverse());
});
Then("the default-list packing item is untouched", async ({ page }) => {
  const { defaultItem } = await storedScopedPacking(scopedPackingState(page));
  expect(defaultItem).toMatchObject({ listId: null, position: 7, labelId: null });
});
