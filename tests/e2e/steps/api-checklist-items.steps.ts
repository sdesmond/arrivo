import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { checklistItems, itineraryChecklists, days } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { When, Then } from "../fixtures";
import { reloadPage } from "../page-reload";
import {
  ensureItemApi,
  headers,
  itemApi,
  itemUrl,
  itemsUrl,
  state,
  storedItems,
  timelineSnapshot,
} from "../api-support";

async function expandPackingChecklist(page: Page) {
  const toggle = page
    .locator("button")
    .filter({ hasText: /\d+ stops/ })
    .first();
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  const checklist = page.locator('[id^="checklist-"]').filter({ hasText: "API packing" });
  if (!(await checklist.getByPlaceholder("Add an item…").isVisible()))
    await checklist.getByRole("button").first().click();
  return checklist;
}
When("I create a checklist item with a client UUID concurrently", async ({ page, scenario }) => {
  const item = await ensureItemApi(page, scenario.currentTrip!.id);
  const responses = await Promise.all(
    [item.id, item.id.toUpperCase(), item.id].map(async (id) =>
      (await apiClient(page)).post(itemsUrl(item.checklistId), {
        headers: headers(page),
        data: { id, content: ` ${item.content} ` },
      })
    )
  );
  const bodies: unknown[] = [];
  for (const response of responses) {
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    bodies.push(await response.json());
  }
  expect(bodies[0]).toMatchObject({
    id: item.id,
    checklistId: item.checklistId,
    content: item.content,
    isChecked: false,
  });
  expect(bodies[1]).toEqual(bodies[0]);
  expect(bodies[2]).toEqual(bodies[0]);
});
Then("the checklist item persists once after the original item after reload", async ({ page }) => {
  const item = itemApi(page);
  await reloadPage(page);
  const checklist = await expandPackingChecklist(page);
  const rows = await storedItems(item.checklistId);
  expect(rows.map((row) => row.content)).toEqual(["API passport", item.content]);
  expect(rows.filter((row) => row.id === item.id)).toHaveLength(1);
  const shown = checklist.locator("[data-checklist-item-id]");
  await expect(shown).toHaveCount(2);
  expect(await shown.evaluateAll((elements) => elements.map((element) => element.textContent?.trim()))).toEqual([
    "API passport",
    item.content,
  ]);
});
When("I reuse the checklist item UUID with different content", async ({ page }) => {
  const item = itemApi(page);
  const responses = await Promise.all(
    ["Collision one", "Collision two"].map(async (content) =>
      (await apiClient(page)).post(itemsUrl(item.checklistId), {
        headers: headers(page),
        data: { id: item.id, content },
      })
    )
  );
  for (const response of responses) expect(response.status()).toBe(409);
  state(page).response = responses[0];
});
Then("the checklist item keeps its original content", async ({ page }) => {
  const item = itemApi(page);
  const rows = await storedItems(item.checklistId);
  expect(rows.map((row) => row.content)).toEqual(["API passport", item.content]);
});
When(
  "I concurrently create checklist items in distinct trips sharing a {string} UUID",
  async ({ page, scenario }, resource: string) => {
    const sharedId = randomUUID();
    const trips: { tripId: string; dayId: string; checklistId: string }[] = [];
    const before = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { trip } = await scenario.materialize({
        trip: {
          mother: "threeDayTrip",
          setCurrent: false,
          overrides: {
            checklists: [
              { title: "Race baseline", dayNumber: 1, position: 0, items: [{ text: "Baseline item", position: 0 }] },
            ],
          },
        },
      });
      if (!trip) throw new Error("Race trip materialization failed");
      const [row] = await withE2EDb((database) =>
        database
          .select({ dayId: days.id, checklistId: itineraryChecklists.id })
          .from(itineraryChecklists)
          .innerJoin(days, eq(itineraryChecklists.dayId, days.id))
          .where(eq(days.tripId, trip.id))
      );
      trips.push({ tripId: trip.id, dayId: row.dayId, checklistId: row.checklistId });
      before.push(await timelineSnapshot(row.dayId));
    }
    const sendItem = async (target: (typeof trips)[number], id: string) =>
      (await apiClient(page)).post(itemsUrl(target.checklistId), {
        headers: headers(page),
        data: { id, content: "Race item" },
      });
    const responses = await Promise.all([
      sendItem(trips[0], sharedId),
      resource === "item"
        ? sendItem(trips[1], sharedId.toUpperCase())
        : (await apiClient(page)).post(`/api/v1/trips/${trips[1].tripId}/checklists`, {
            headers: headers(page),
            data: {
              dayId: trips[1].dayId,
              position: 1,
              firstItem: { id: sharedId.toUpperCase(), content: "Race item" },
            },
          }),
    ]);
    const statuses = responses.map((response) => response.status());
    for (const response of responses) {
      expect(response.headers()["cache-control"]).toBe("no-store");
      if (response.status() === 409) expect((await response.json()).error.code).toBe("conflict");
    }
    scenario.setValue("item-race", { sharedId, trips, before, statuses });
  }
);
Then("the cross-trip item collision has one winner and an untouched loser", async ({ scenario }) => {
  const race = scenario.getValue<{
    sharedId: string;
    trips: { tripId: string; dayId: string; checklistId: string }[];
    before: Awaited<ReturnType<typeof timelineSnapshot>>[];
    statuses: number[];
  }>("item-race")!;
  expect([...race.statuses].sort()).toEqual([200, 409]);
  const loser = race.statuses.indexOf(409);
  expect(await timelineSnapshot(race.trips[loser].dayId)).toEqual(race.before[loser]);
  const owners = await withE2EDb((database) =>
    database.select({ id: checklistItems.id }).from(checklistItems).where(eq(checklistItems.id, race.sharedId))
  );
  expect(owners).toHaveLength(1);
});
When("I patch the checklist item content, checked state and an empty body", async ({ page, scenario }) => {
  const item = await ensureItemApi(page, scenario.currentTrip!.id);
  const url = itemUrl(state(page).itemId);
  const patch = async (data: unknown, status: number) => {
    const response = await (await apiClient(page)).patch(url, { headers: headers(page), data });
    expect(response.status()).toBe(status);
    return response;
  };
  expect(await (await patch({ content: " Renamed passport " }, 200)).json()).toMatchObject({
    content: "Renamed passport",
    isChecked: false,
  });
  expect(await (await patch({ isChecked: true }, 200)).json()).toMatchObject({
    content: "Renamed passport",
    isChecked: true,
  });
  expect(await (await patch({}, 200)).json()).toMatchObject({ content: "Renamed passport", isChecked: true });
  for (const invalid of [{ content: "   " }, { content: "x".repeat(301) }, { unknown: true }, { isChecked: null }]) {
    const response = await patch(invalid, 422);
    expect((await response.json()).error.code).toBe("validation_failed");
  }
  const rows = await storedItems(item.checklistId);
  expect(rows).toMatchObject([{ content: "Renamed passport", isChecked: true }]);
});
When("I resend the same checklist item content and checked state", async ({ page }) => {
  const response = await (
    await apiClient(page)
  ).patch(itemUrl(state(page).itemId), {
    headers: headers(page),
    data: { content: "Renamed passport", isChecked: true },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ content: "Renamed passport", isChecked: true });
});
Then("the checklist item has the patched content and checked state after reload", async ({ page }) => {
  await reloadPage(page);
  const checklist = await expandPackingChecklist(page).catch(() => undefined);
  const [row] = await storedItems(itemApi(page).checklistId);
  expect(row).toMatchObject({ content: "Renamed passport", isChecked: true });
  if (checklist) await expect(checklist.getByLabel("Complete")).toBeVisible();
});
When("I delete the checklist item with the wrong trip and then twice", async ({ page, scenario }) => {
  const itemId = state(page).itemId;
  await ensureItemApi(page, scenario.currentTrip!.id);
  const { trip: otherTrip } = await scenario.materialize({ trip: { mother: "threeDayTrip", setCurrent: false } });
  const wrongTrip = await (
    await apiClient(page)
  ).delete(itemUrl(itemId), {
    headers: headers(page),
    data: { tripId: otherTrip!.id },
  });
  expect(wrongTrip.status()).toBe(404);
  expect((await wrongTrip.json()).error.code).toBe("not_found");
  expect(await storedItems(itemApi(page).checklistId)).toHaveLength(1);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await (
      await apiClient(page)
    ).delete(itemUrl(itemId), {
      headers: { ...headers(page), "idempotency-key": state(page).key },
      data: { tripId: scenario.currentTrip!.id },
    });
    expect(response.status()).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
  const unkeyed = await (
    await apiClient(page)
  ).delete(itemUrl(itemId), {
    headers: headers(page),
    data: { tripId: scenario.currentTrip!.id },
  });
  expect(unkeyed.status()).toBe(204);
});
Then("the checklist item is absent after reload", async ({ page }) => {
  await reloadPage(page);
  expect(await storedItems(itemApi(page).checklistId)).toHaveLength(0);
  await expect(page.locator(`[data-checklist-item-id="${state(page).itemId}"]`)).toHaveCount(0);
});
When("I attempt the checklist item API operation {string}", async ({ page, scenario }, operation: string) => {
  const item = await ensureItemApi(page, scenario.currentTrip!.id);
  item.countBefore = (await storedItems(item.checklistId)).length;
  const requestHeaders = headers(page);
  const client = await apiClient(page);
  state(page).response =
    operation === "create"
      ? await client.post(itemsUrl(item.checklistId), {
          headers: requestHeaders,
          data: { id: item.id, content: item.content },
        })
      : await client.delete(itemUrl(state(page).itemId), {
          headers: requestHeaders,
          data: { tripId: item.tripId },
        });
});
Then(
  "the checklist item API returns {int} with code {string} and the item list is unchanged",
  async ({ page }, status: number, code: string) => {
    const response = state(page).response!;
    expect(response.status()).toBe(status);
    expect((await response.json()).error.code).toBe(code);
    expect(response.headers()["cache-control"]).toBe("no-store");
    const item = itemApi(page);
    const rows = await storedItems(item.checklistId);
    expect(rows).toHaveLength(item.countBefore!);
    expect(rows.some((row) => row.id === item.id)).toBe(false);
    expect(rows.some((row) => row.id === state(page).itemId)).toBe(true);
  }
);
When("I send {int} keyed checklist item creations one after another", async ({ page, scenario }, count: number) => {
  const item = await ensureItemApi(page, scenario.currentTrip!.id);
  const bodies: unknown[] = [];
  for (let attempt = 0; attempt < count; attempt += 1) {
    const response = await (
      await apiClient(page)
    ).post(itemsUrl(item.checklistId), {
      headers: { ...headers(page), "idempotency-key": state(page).key },
      data: { id: item.id, content: item.content },
    });
    expect(response.status()).toBe(200);
    bodies.push(await response.json());
  }
  for (const body of bodies) expect(body).toEqual(bodies[0]);
});
Then("exactly one checklist item was created for that key", async ({ page }) => {
  const item = itemApi(page);
  const rows = await storedItems(item.checklistId);
  expect(rows.filter((row) => row.id === item.id)).toHaveLength(1);
  expect(rows).toHaveLength(2);
});
When("I reuse the item creation key with different content", async ({ page }) => {
  const item = itemApi(page);
  item.countBefore = (await storedItems(item.checklistId)).length;
  state(page).response = await (
    await apiClient(page)
  ).post(itemsUrl(item.checklistId), {
    headers: { ...headers(page), "idempotency-key": state(page).key },
    data: { content: "A different item" },
  });
});
Then("the checklist item API returns 409 with code {string} and no new item", async ({ page }, code: string) => {
  const response = state(page).response!;
  expect(response.status()).toBe(409);
  expect((await response.json()).error.code).toBe(code);
  const item = itemApi(page);
  expect(await storedItems(item.checklistId)).toHaveLength(item.countBefore!);
});
When("I retry the keyed checklist item creation", async ({ page }) => {
  const item = itemApi(page);
  item.countBefore = (await storedItems(item.checklistId)).length;
  state(page).response = await (
    await apiClient(page)
  ).post(itemsUrl(item.checklistId), {
    headers: { ...headers(page), "idempotency-key": state(page).key },
    data: { id: item.id, content: item.content },
  });
});
Then(
  "the checklist item retry returns {int} with code {string} and no extra item",
  async ({ page }, status: number, code: string) => {
    const response = state(page).response!;
    expect(response.status()).toBe(status);
    expect((await response.json()).error.code).toBe(code);
    const item = itemApi(page);
    expect(await storedItems(item.checklistId)).toHaveLength(item.countBefore!);
  }
);
