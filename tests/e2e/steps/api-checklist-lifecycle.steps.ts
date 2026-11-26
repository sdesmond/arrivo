import { expect, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { checklistItems, itineraryChecklists, days, events, itineraryNotes } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { When, Then } from "../fixtures";
import { reloadPage } from "../page-reload";
import { expandLifecycleDay, headers, lifecycleInput, state, timelineSnapshot } from "../api-support";

async function sendLifecycleCreate(page: Page, tripId: string, keyed: boolean) {
  const { tripId: requestTrip, ...body } = await lifecycleInput(page, tripId);
  const response = await (
    await apiClient(page)
  ).post(`/api/v1/trips/${requestTrip}/checklists`, {
    headers: { ...headers(page), ...(keyed ? { "idempotency-key": state(page).key } : {}) },
    data: body,
  });
  state(page).response = response;
  return response;
}
When("I create a checklist with its first item through the lifecycle API concurrently", async ({ page, scenario }) => {
  await lifecycleInput(page, scenario.currentTrip!.id);
  const responses = await Promise.all(
    Array.from({ length: 3 }, () => sendLifecycleCreate(page, scenario.currentTrip!.id, false))
  );
  const bodies: unknown[] = [];
  for (const response of responses) {
    expect(response.status()).toBe(200);
    bodies.push(await response.json());
  }
  expect(bodies[1]).toEqual(bodies[0]);
  expect(bodies[2]).toEqual(bodies[0]);
});
Then("lifecycle creation persists once with mixed timeline ordering after reload", async ({ page }) => {
  const input = state(page).lifecycle!;
  await reloadPage(page);
  await expandLifecycleDay(page);
  const result = await withE2EDb(async (database) => {
    const created = await database.select().from(itineraryChecklists).where(eq(itineraryChecklists.id, input.id));
    const items = await database.select().from(checklistItems).where(eq(checklistItems.checklistId, input.id));
    const eventRows = await database
      .select({ position: events.position })
      .from(events)
      .where(eq(events.dayId, input.dayId));
    const noteRows = await database
      .select({ position: itineraryNotes.position })
      .from(itineraryNotes)
      .where(eq(itineraryNotes.dayId, input.dayId));
    const lists = await database
      .select({ position: itineraryChecklists.position })
      .from(itineraryChecklists)
      .where(eq(itineraryChecklists.dayId, input.dayId));
    return { created, items, eventRows, noteRows, lists };
  });
  expect(result.created).toHaveLength(1);
  expect(result.items).toHaveLength(1);
  expect(result.items[0].id).toBe(input.firstItem.id);
  expect(result.eventRows.map((entry) => entry.position).sort((left, right) => left - right)).toEqual([0, 4]);
  expect(result.noteRows.map((entry) => entry.position)).toEqual([2]);
  expect(result.lists.map((entry) => entry.position).sort()).toEqual([1, 3]);
  await expect(page.locator(`#checklist-${input.id}`)).toContainText("Lifecycle packing");
  const timeline = page.getByRole("main").locator('[id^="event-"], [id^="checklist-"], [id^="note-"]');
  await expect(timeline).toHaveCount(5);
  expect(await timeline.evaluateAll((elements) => elements.map((element) => element.id.split("-")[0]))).toEqual([
    "event",
    "checklist",
    "note",
    "checklist",
    "event",
  ]);
  const untouched = state(page).untouchedDay!;
  expect(await timelineSnapshot(untouched.dayId)).toEqual(untouched.before);
});
When("I create another checklist at the lifecycle position", async ({ page }) => {
  const { tripId, dayId, position } = state(page).lifecycle!;
  const response = await (
    await apiClient(page)
  ).post(`/api/v1/trips/${tripId}/checklists`, {
    headers: headers(page),
    data: { dayId, position, id: randomUUID(), title: "Shifting insert" },
  });
  expect(response.status()).toBe(200);
});
When("I retry the lifecycle checklist creation", async ({ page, scenario }) => {
  await sendLifecycleCreate(page, scenario.currentTrip!.id, false);
});
Then("the lifecycle retry returns the original checklist at its shifted position", async ({ page }) => {
  const input = state(page).lifecycle!;
  const response = state(page).response!;
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ id: input.id, tripDayId: input.dayId, position: input.position + 1 });
});
Then("the day holds the original and the shifting checklist once after reload", async ({ page }) => {
  const input = state(page).lifecycle!;
  await reloadPage(page);
  const rows = await withE2EDb((database) =>
    database
      .select({ id: itineraryChecklists.id, position: itineraryChecklists.position })
      .from(itineraryChecklists)
      .where(eq(itineraryChecklists.dayId, input.dayId))
  );
  // The seeded day already holds one checklist: expect it, the original (shifted once) and the shifting insert.
  expect(rows).toHaveLength(3);
  expect(rows.filter((row) => row.id === input.id).map((row) => row.position)).toEqual([input.position + 1]);
  expect(rows.some((row) => row.position === input.position)).toBe(true);
});
When("I reuse the lifecycle checklist UUID with different content", async ({ page }) => {
  const { tripId, ...body } = state(page).lifecycle!;
  const responses = await Promise.all(
    ["Collision one", "Collision two"].map(async (title) =>
      (await apiClient(page)).post(`/api/v1/trips/${tripId}/checklists`, {
        headers: headers(page),
        data: { ...body, title },
      })
    )
  );
  for (const response of responses) expect(response.status()).toBe(409);
  state(page).response = responses[0];
});
const BLANK_FIRST_ITEMS: Record<string, string> = { empty: "", spaces: "   ", "tab and newline": "\t\n" };
When("I create a lifecycle checklist whose first item is {string}", async ({ page, scenario }, kind: string) => {
  const content = BLANK_FIRST_ITEMS[kind];
  expect(content, `unknown blank first item "${kind}"`).toBeDefined();
  const { tripId, firstItem, ...body } = await lifecycleInput(page, scenario.currentTrip!.id);
  state(page).response = await (
    await apiClient(page)
  ).post(`/api/v1/trips/${tripId}/checklists`, {
    headers: headers(page),
    data: { ...body, firstItem: { id: firstItem.id, content } },
  });
});
Then("the lifecycle API returns {int}", async ({ page }, status: number) => {
  const response = state(page).response!;
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const body = await response.json();
  expect(Object.keys(body)).toEqual(["error"]);
});
When("I rename, omit and clear the lifecycle checklist title", async ({ page }) => {
  const input = state(page).lifecycle!;
  for (const [body, title] of [
    [{ title: "Renamed lifecycle" }, "Renamed lifecycle"],
    [{}, "Renamed lifecycle"],
    [{ title: null }, undefined],
  ] as const) {
    const response = await (
      await apiClient(page)
    ).patch(`/api/v1/checklists/${input.id}`, { headers: headers(page), data: body });
    expect(response.status()).toBe(200);
    expect((await response.json()).title).toBe(title);
  }
});
Then("the lifecycle checklist title is cleared after reload", async ({ page }) => {
  await reloadPage(page);
  await expandLifecycleDay(page);
  const input = state(page).lifecycle!;
  const [row] = await withE2EDb((database) =>
    database.select().from(itineraryChecklists).where(eq(itineraryChecklists.id, input.id))
  );
  expect(row.title).toBeNull();
  await expect(page.locator(`#checklist-${input.id}`)).toBeVisible();
  await expect(page.locator(`#checklist-${input.id}`)).not.toContainText("Renamed lifecycle");
});
When("I delete the lifecycle checklist twice", async ({ page }) => {
  const input = state(page).lifecycle!;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await (
      await apiClient(page)
    ).delete(`/api/v1/checklists/${input.id}`, {
      headers: { ...headers(page), "idempotency-key": state(page).key },
      data: { tripId: input.tripId },
    });
    expect(response.status()).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
  const response = await (
    await apiClient(page)
  ).delete(`/api/v1/checklists/${input.id}`, {
    headers: headers(page),
    data: { tripId: input.tripId },
  });
  expect(response.status()).toBe(204);
});
Then("the lifecycle checklist is absent after reload", async ({ page }) => {
  await reloadPage(page);
  await expandLifecycleDay(page);
  const input = state(page).lifecycle!;
  await expect(page.locator(`#checklist-${input.id}`)).toHaveCount(0);
  const items = await withE2EDb((database) =>
    database.select().from(checklistItems).where(eq(checklistItems.checklistId, input.id))
  );
  expect(items).toHaveLength(0);
});
When("I create a keyed lifecycle checklist", async ({ page, scenario }) => {
  const response = await sendLifecycleCreate(page, scenario.currentTrip!.id, true);
  expect(response.status()).toBe(200);
});
When("I retry the keyed lifecycle creation", async ({ page, scenario }) => {
  await sendLifecycleCreate(page, scenario.currentTrip!.id, true);
});
When("I attempt keyed lifecycle creation", async ({ page, scenario }) => {
  await sendLifecycleCreate(page, scenario.currentTrip!.id, true);
});
Then("lifecycle creation left no rows or timeline shifts", async ({ page }) => {
  const input = state(page).lifecycle!;
  const result = await withE2EDb(async (database) => ({
    lists: await database.select().from(itineraryChecklists).where(eq(itineraryChecklists.dayId, input.dayId)),
    items: await database.select().from(checklistItems).where(eq(checklistItems.id, input.firstItem.id)),
    notes: await database.select().from(itineraryNotes).where(eq(itineraryNotes.dayId, input.dayId)),
  }));
  expect(result.lists).toHaveLength(1);
  expect(result.lists[0].position).toBe(2);
  expect(result.items).toHaveLength(0);
  expect(result.notes[0].position).toBe(1);
});
When(
  "I concurrently create lifecycle checklists in distinct trips sharing a {string} UUID",
  async ({ page, scenario }, resource: string) => {
    const sharedId = randomUUID();
    const requests = [];
    const before = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { trip } = await scenario.materialize({
        trip: {
          mother: "threeDayTrip",
          setCurrent: false,
          overrides: {
            events: [
              { name: "Race before", dayNumber: 1, position: 0 },
              { name: "Race after", dayNumber: 1, position: 2 },
            ],
            notes: [{ content: "Race note", dayNumber: 1, position: 1 }],
            checklists: [
              { title: "Race baseline", dayNumber: 1, position: 3, items: [{ text: "Baseline item", position: 0 }] },
            ],
          },
        },
      });
      if (!trip) throw new Error("Race trip materialization failed");
      const [day] = await withE2EDb((database) =>
        database
          .select({ id: days.id })
          .from(days)
          .where(and(eq(days.tripId, trip.id), eq(days.dayNumber, 1)))
      );
      const checklistId = resource === "checklist" ? sharedId : randomUUID();
      const firstItemId = resource === "first-item" ? sharedId : randomUUID();
      requests.push({
        tripId: trip.id,
        body: {
          dayId: day.id,
          position: 1,
          id: attempt === 1 ? checklistId.toUpperCase() : checklistId,
          title: "Race created",
          firstItem: { id: attempt === 1 ? firstItemId.toUpperCase() : firstItemId, content: "Race item" },
        },
      });
      before.push(await timelineSnapshot(day.id));
    }
    const responses = await Promise.all(
      requests.map(async (request) =>
        (await apiClient(page)).post(`/api/v1/trips/${request.tripId}/checklists`, {
          headers: headers(page),
          data: request.body,
        })
      )
    );
    const statuses = responses.map((response) => response.status());
    for (const response of responses) {
      expect(response.headers()["cache-control"]).toBe("no-store");
      if (response.status() === 409) expect((await response.json()).error.code).toBe("conflict");
    }
    scenario.setValue("lifecycle-race", { requests, before, statuses });
  }
);
Then("the cross-trip lifecycle collision has one winner and an untouched loser", async ({ scenario }) => {
  const race = scenario.getValue<{
    requests: { tripId: string; body: { dayId: string; id: string; firstItem: { id: string } } }[];
    before: Awaited<ReturnType<typeof timelineSnapshot>>[];
    statuses: number[];
  }>("lifecycle-race")!;
  expect([...race.statuses].sort()).toEqual([200, 409]);
  const winner = race.statuses.indexOf(200);
  const loser = race.statuses.indexOf(409);
  expect(await timelineSnapshot(race.requests[loser].body.dayId)).toEqual(race.before[loser]);
  const committed = await timelineSnapshot(race.requests[winner].body.dayId);
  expect(committed.checklists).toHaveLength(race.before[winner].checklists.length + 1);
  expect(committed.items).toHaveLength(race.before[winner].items.length + 1);
  expect(committed.checklists.find((entry) => entry.id === race.requests[winner].body.id.toLowerCase())?.position).toBe(
    1
  );
  expect(committed.items.some((entry) => entry.id === race.requests[winner].body.firstItem.id.toLowerCase())).toBe(
    true
  );
  expect(committed.events.map((entry) => entry.position).sort((left, right) => left - right)).toEqual([0, 3]);
  expect(committed.notes.map((entry) => entry.position)).toEqual([2]);
  expect(committed.checklists.map((entry) => entry.position).sort((left, right) => left - right)).toEqual([1, 4]);
});
