import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  checklistItems,
  itineraryChecklists,
  events,
  itineraryNotes,
  packingItems,
  packingTemplates,
  tripPackingLists,
} from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { Given, When, Then } from "../fixtures";
import { reloadPage } from "../page-reload";
import {
  PackingSourceType,
  SourceApiState,
  dayOneId,
  expandLifecycleDay,
  headers,
  sourceApi,
  sourceApiStates,
  state,
  timelineSnapshot,
} from "../api-support";

// Seed order differs from position order, and a label sits among the items, so ordering and label exclusion both show.
const SOURCE_ENTRIES = [
  { text: "Charger", isLabel: false, position: 3 },
  { text: "Passport copy", isLabel: false, position: 1 },
  { text: "Documents", isLabel: true, position: 0 },
  { text: "Adapter", isLabel: false, position: 2 },
];
const SOURCE_CONTENTS = ["Passport copy", "Adapter", "Charger"];
async function seedPackingList(tripId: string, name: string): Promise<string> {
  return withE2EDb(async (database) => {
    const [list] = await database
      .insert(tripPackingLists)
      .values({ tripId, name, position: 0 })
      .returning({ id: tripPackingLists.id });
    await database.insert(packingItems).values(
      SOURCE_ENTRIES.map((entry) => ({
        tripId,
        listId: list.id,
        name: entry.text,
        isLabel: entry.isLabel,
        position: entry.position,
      }))
    );
    return list.id;
  });
}
async function sourceItemsInOrder(checklistId: string): Promise<{ content: string; isChecked: boolean }[]> {
  return withE2EDb((database) =>
    database
      .select({ content: checklistItems.content, isChecked: checklistItems.isChecked })
      .from(checklistItems)
      .where(eq(checklistItems.checklistId, checklistId))
      .orderBy(checklistItems.createdAt)
  );
}
async function postSourceCreate(page: Page, input: SourceApiState, key?: string) {
  return (await apiClient(page)).post(`/api/v1/trips/${input.tripId}/checklists`, {
    headers: { ...headers(page), ...(key ? { "idempotency-key": key } : {}) },
    data: { dayId: input.dayId, position: input.position, id: input.checklistId, source: input.source },
  });
}
Given("a scenario-owned {string} packing source", async ({ page, scenario }, type: string) => {
  const tripId = scenario.currentTrip!.id;
  const title = `API ${type} source`;
  let sourceId: string;
  if (type === "template") {
    const { template } = await scenario.materialize({
      template: { overrides: { template: { name: title }, items: SOURCE_ENTRIES }, setCurrent: false },
    });
    sourceId = template!.id;
  } else {
    sourceId = await seedPackingList(tripId, title);
  }
  const dayId = await dayOneId(tripId);
  sourceApiStates.set(page, {
    tripId,
    dayId,
    checklistId: randomUUID(),
    position: 1,
    source: { type: type as PackingSourceType, id: sourceId },
    title,
    contents: SOURCE_CONTENTS,
    before: await timelineSnapshot(dayId),
  });
});
When(
  "I create a checklist from that source through the API {int} times concurrently",
  async ({ page }, count: number) => {
    const input = sourceApi(page);
    const responses = await Promise.all(Array.from({ length: count }, () => postSourceCreate(page, input)));
    const bodies: { title: string; position: number; items: { content: string; isChecked: boolean }[] }[] = [];
    for (const response of responses) {
      expect(response.status()).toBe(200);
      bodies.push(await response.json());
    }
    for (const body of bodies) expect(body).toEqual(bodies[0]);
    input.first = bodies[0];
    expect(bodies[0]).toMatchObject({ id: input.checklistId, title: input.title, position: 1 });
    expect(bodies[0].items.map((item) => [item.content, item.isChecked])).toEqual(
      input.contents.map((content) => [content, false])
    );
  }
);
Then(
  "the source checklist persists once with ordered unchecked items and shifted timeline after reload",
  async ({ page }) => {
    const input = sourceApi(page);
    await reloadPage(page);
    await expandLifecycleDay(page);
    const result = await withE2EDb(async (database) => ({
      created: await database.select().from(itineraryChecklists).where(eq(itineraryChecklists.id, input.checklistId)),
      eventRows: await database.select({ position: events.position }).from(events).where(eq(events.dayId, input.dayId)),
      noteRows: await database
        .select({ position: itineraryNotes.position })
        .from(itineraryNotes)
        .where(eq(itineraryNotes.dayId, input.dayId)),
      lists: await database
        .select({ position: itineraryChecklists.position })
        .from(itineraryChecklists)
        .where(eq(itineraryChecklists.dayId, input.dayId)),
    }));
    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toMatchObject({ title: input.title, position: 1, dayId: input.dayId });
    expect(await sourceItemsInOrder(input.checklistId)).toEqual(
      input.contents.map((content) => ({ content, isChecked: false }))
    );
    expect(result.eventRows.map((entry) => entry.position).sort((left, right) => left - right)).toEqual([0, 4]);
    expect(result.noteRows.map((entry) => entry.position)).toEqual([2]);
    expect(result.lists.map((entry) => entry.position).sort((left, right) => left - right)).toEqual([1, 3]);
    await expect(page.locator(`#checklist-${input.checklistId}`)).toContainText(input.title);
  }
);
When("I append an item to the source checklist through the API", async ({ page }) => {
  const input = sourceApi(page);
  const response = await (
    await apiClient(page)
  ).post(`/api/v1/checklists/${input.checklistId}/items`, {
    headers: headers(page),
    data: { content: "Late addition" },
  });
  expect(response.status()).toBe(200);
});
Then("the appended item sorts after every copied item", async ({ page }) => {
  const input = sourceApi(page);
  expect((await sourceItemsInOrder(input.checklistId)).map((item) => item.content)).toEqual([
    ...input.contents,
    "Late addition",
  ]);
});
When("I reuse the source checklist UUID at a different position", async ({ page }) => {
  const input = sourceApi(page);
  state(page).response = await postSourceCreate(page, { ...input, position: 3 });
});
Then("the source checklist keeps its single set of items", async ({ page }) => {
  const input = sourceApi(page);
  // The copied items plus the one appended earlier in the scenario; the rejected reuse added none.
  expect(await sourceItemsInOrder(input.checklistId)).toHaveLength(input.contents.length + 1);
});
When("I create a keyed checklist from that source", async ({ page }) => {
  const input = sourceApi(page);
  const response = await postSourceCreate(page, input, state(page).key);
  expect(response.status()).toBe(200);
  input.first = await response.json();
});
When("the packing source is renamed", async ({ page }) => {
  const input = sourceApi(page);
  await withE2EDb(async (database) => {
    if (input.source.type === "template")
      await database
        .update(packingTemplates)
        .set({ name: "Renamed source" })
        .where(eq(packingTemplates.id, input.source.id));
    else
      await database
        .update(tripPackingLists)
        .set({ name: "Renamed source" })
        .where(eq(tripPackingLists.id, input.source.id));
  });
});
When("the packing source is deleted", async ({ page }) => {
  const input = sourceApi(page);
  await withE2EDb(async (database) => {
    if (input.source.type === "template")
      await database.delete(packingTemplates).where(eq(packingTemplates.id, input.source.id));
    else await database.delete(tripPackingLists).where(eq(tripPackingLists.id, input.source.id));
  });
});
When("I retry the keyed source creation", async ({ page }) => {
  const input = sourceApi(page);
  const response = await postSourceCreate(page, input, state(page).key);
  state(page).response = response;
  input.retry = { status: response.status(), body: await response.json().catch(() => null) };
});
Then("the keyed source retry returns the original checklist and no extra rows", async ({ page }) => {
  const input = sourceApi(page);
  expect(input.retry?.status).toBe(200);
  expect(input.retry?.body).toEqual(input.first);
  expect((input.retry!.body as { title: string }).title).toBe(input.title);
  const rows = await withE2EDb((database) =>
    database
      .select({ id: itineraryChecklists.id })
      .from(itineraryChecklists)
      .where(eq(itineraryChecklists.dayId, input.dayId))
  );
  expect(rows.filter((row) => row.id === input.checklistId)).toHaveLength(1);
  expect(await sourceItemsInOrder(input.checklistId)).toHaveLength(input.contents.length);
});
Then("the keyed source retry is concealed as {int} and leaks no cached checklist", async ({ page }, status: number) => {
  const input = sourceApi(page);
  const response = state(page).response!;
  expect(response.status()).toBe(status);
  const text = await response.text();
  expect(text).not.toContain(input.title);
  expect(text).not.toContain(input.checklistId);
  expect(response.headers()["cache-control"]).toBe("no-store");
});
When("I attempt a source checklist creation", async ({ page }) => {
  state(page).response = await postSourceCreate(page, sourceApi(page));
});
When("I attempt a source checklist creation with a {string} source", async ({ page, scenario }, scope: string) => {
  const input = sourceApi(page);
  if (scope === "foreign-template") {
    const { user: stranger } = await scenario.materialize({ user: { setCurrent: false } });
    input.secretName = "Foreign secret template";
    const { template } = await scenario.materialize({
      template: {
        userId: stranger!.id,
        overrides: { template: { name: input.secretName }, items: SOURCE_ENTRIES },
        setCurrent: false,
      },
    });
    input.source = { type: "template", id: template!.id };
  } else if (scope === "missing-template") {
    input.source = { type: "template", id: randomUUID() };
  } else {
    const { trip: other } = await scenario.materialize({
      trip: { mother: "threeDayTrip", setCurrent: false },
    });
    const otherDayId = await dayOneId(other!.id);
    input.other = { dayId: otherDayId, before: await timelineSnapshot(otherDayId) };
    if (scope === "other-trip-list") {
      input.secretName = "Other trip list";
      input.source = { type: "packing-list", id: await seedPackingList(other!.id, input.secretName) };
    } else {
      input.dayId = otherDayId;
    }
  }
  state(page).response = await postSourceCreate(page, input);
});
Then("the source creation changed no rows or positions", async ({ page }) => {
  const input = sourceApi(page);
  const response = state(page).response!;
  expect(response.headers()["cache-control"]).toBe("no-store");
  if (input.secretName) expect(await response.text()).not.toContain(input.secretName);
  expect(await timelineSnapshot(await dayOneId(input.tripId))).toEqual(input.before);
  if (input.other) expect(await timelineSnapshot(input.other.dayId)).toEqual(input.other.before);
  expect(await sourceItemsInOrder(input.checklistId)).toEqual([]);
});
