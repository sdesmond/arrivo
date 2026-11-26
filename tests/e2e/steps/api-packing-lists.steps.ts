import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { packingItems, tripPackingLists } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { Given, When, Then } from "../fixtures";
import { headers, packingListApi, packingListApiStates, states } from "../api-support";

async function storedPackingLists(tripId: string) {
  return withE2EDb((database) =>
    database
      .select({ id: tripPackingLists.id, name: tripPackingLists.name, position: tripPackingLists.position })
      .from(tripPackingLists)
      .where(eq(tripPackingLists.tripId, tripId))
      .orderBy(tripPackingLists.position)
  );
}
async function sendPackingList(page: Page, method: "post" | "patch" | "delete", url: string, data: unknown) {
  const response = await (await apiClient(page))[method](url, { headers: headers(page), data });
  const text = await response.text();
  const result = { status: response.status(), body: text ? JSON.parse(text) : undefined };
  packingListApi(page).responses.push(result);
  return result;
}
Given("a scenario-owned packing list API fixture", async ({ page, scenario }) => {
  const result = await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        packingLists: [
          {
            name: "Doomed list",
            position: 0,
            items: [
              { name: "Doomed socks", done: false, isLabel: false, position: 0 },
              { name: "Doomed hat", done: false, isLabel: false, position: 1 },
            ],
          },
          { name: "Kept list", position: 1, items: [{ name: "Kept boots", done: false, isLabel: false, position: 0 }] },
        ],
      },
      setCurrent: true,
    },
  });
  const tripId = result.trip!.id;
  const [defaultItem] = await withE2EDb((database) =>
    database
      .insert(packingItems)
      .values({ tripId, name: "Default towel", position: 0, done: false })
      .returning({ id: packingItems.id })
  );
  const lists = await storedPackingLists(tripId);
  const unique = randomUUID();
  states.set(page, {
    itemId: defaultItem.id,
    key: `packing-list-${unique}`,
    suffix: unique.replaceAll("-", ""),
    responses: [],
  });
  packingListApiStates.set(page, {
    tripId,
    doomedId: lists.find((list) => list.name === "Doomed list")!.id,
    keptId: lists.find((list) => list.name === "Kept list")!.id,
    defaultItemId: defaultItem.id,
    responses: [],
  });
  await scenario.signIn(page);
  await scenario.gotoCurrentTrip(page);
});
When("I create a packing list through the API twice with the same id", async ({ page }) => {
  const current = packingListApi(page);
  const body = { id: randomUUID(), name: "Created list" };
  current.created = body;
  for (let attempt = 0; attempt < 2; attempt += 1)
    await sendPackingList(page, "post", `/api/v1/trips/${current.tripId}/packing-lists`, body);
});
Then("both packing list creations return 200 for one list at position 2", async ({ page }) => {
  const current = packingListApi(page);
  expect(current.responses.map((response) => response.status)).toEqual([200, 200]);
  expect(current.responses[0].body).toMatchObject({ id: current.created!.id, name: "Created list", position: 2 });
  const created = (await storedPackingLists(current.tripId)).filter((list) => list.id === current.created!.id);
  expect(created).toHaveLength(1);
});
Then("creating the same id with another name returns 409 and the name is unchanged", async ({ page }) => {
  const current = packingListApi(page);
  const conflict = await sendPackingList(page, "post", `/api/v1/trips/${current.tripId}/packing-lists`, {
    id: current.created!.id,
    name: "Other name",
  });
  expect(conflict.status).toBe(409);
  const stored = (await storedPackingLists(current.tripId)).find((list) => list.id === current.created!.id);
  expect(stored?.name).toBe("Created list");
});
When("I {word} a packing list named with 31 characters", async ({ page }, operation: string) => {
  const current = packingListApi(page);
  const name = "x".repeat(31);
  if (operation === "create")
    await sendPackingList(page, "post", `/api/v1/trips/${current.tripId}/packing-lists`, { id: randomUUID(), name });
  else
    await sendPackingList(page, "patch", `/api/v1/packing-lists/${current.keptId}`, { tripId: current.tripId, name });
});
Then("the packing list API returns 422 with code {string}", async ({ page }, code: string) => {
  const [response] = packingListApi(page).responses;
  expect(response.status).toBe(422);
  expect((response.body as { error: { code: string } }).error.code).toBe(code);
});
Then("the packing lists are unchanged", async ({ page }) => {
  const current = packingListApi(page);
  expect((await storedPackingLists(current.tripId)).map((list) => list.name)).toEqual(["Doomed list", "Kept list"]);
});
When("I rename the packing list through the API", async ({ page }) => {
  const current = packingListApi(page);
  await sendPackingList(page, "patch", `/api/v1/packing-lists/${current.keptId}`, {
    tripId: current.tripId,
    name: " Renamed list ",
  });
});
Then("the packing list API returns the renamed list", async ({ page }) => {
  const current = packingListApi(page);
  expect(current.responses[0].status).toBe(200);
  expect(current.responses[0].body).toMatchObject({ id: current.keptId, name: "Renamed list", position: 1 });
  expect((await storedPackingLists(current.tripId)).map((list) => list.name)).toEqual(["Doomed list", "Renamed list"]);
});
Then("renaming a missing packing list returns 404", async ({ page }) => {
  const current = packingListApi(page);
  const missing = await sendPackingList(page, "patch", `/api/v1/packing-lists/${randomUUID()}`, {
    tripId: current.tripId,
    name: "Nowhere",
  });
  expect(missing.status).toBe(404);
});
When("I delete the packing list through the API twice and a missing list once", async ({ page }) => {
  const current = packingListApi(page);
  for (const listId of [current.doomedId, current.doomedId, randomUUID()])
    await sendPackingList(page, "delete", `/api/v1/packing-lists/${listId}`, { tripId: current.tripId });
});
Then("the packing list deletions return 204", async ({ page }) => {
  expect(packingListApi(page).responses.map((response) => response.status)).toEqual([204, 204, 204]);
});
Then("only the other list and the default items remain", async ({ page }) => {
  const current = packingListApi(page);
  expect((await storedPackingLists(current.tripId)).map((list) => list.name)).toEqual(["Kept list"]);
  const items = await withE2EDb((database) =>
    database
      .select({ name: packingItems.name })
      .from(packingItems)
      .where(eq(packingItems.tripId, current.tripId))
      .orderBy(packingItems.name)
  );
  expect(items.map((item) => item.name)).toEqual(["Default towel", "Kept boots"]);
});
When("I attempt every packing list write through the API", async ({ page }) => {
  const current = packingListApi(page);
  await sendPackingList(page, "post", `/api/v1/trips/${current.tripId}/packing-lists`, {
    id: randomUUID(),
    name: "Denied",
  });
  await sendPackingList(page, "patch", `/api/v1/packing-lists/${current.keptId}`, {
    tripId: current.tripId,
    name: "Denied",
  });
  await sendPackingList(page, "delete", `/api/v1/packing-lists/${current.doomedId}`, { tripId: current.tripId });
});
Then("every packing list write returns {int} with code {string}", async ({ page }, status: number, code: string) => {
  const responses = packingListApi(page).responses;
  expect(responses.map((response) => response.status)).toEqual([status, status, status]);
  for (const response of responses) expect((response.body as { error: { code: string } }).error.code).toBe(code);
});
