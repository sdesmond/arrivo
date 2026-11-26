import { expect, type Page } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import {
  checklistItems,
  itineraryChecklists,
  days,
  idempotencyKeys,
  documents,
  events,
  expenses,
  itineraryNotes,
  notes,
  packingItems,
  tripPackingLists,
  reservations,
} from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { ExpenseCategory } from "../../../src/data/types";
import { apiClient } from "../anonymous-api";
import { Given, When, Then } from "../fixtures";
import { headers } from "../api-support";

interface CascadeReplayRow {
  resource: string;
  id: string;
  path?: string;
  data?: Record<string, unknown>;
}
const cascadeReplayGraphs = new WeakMap<
  Page,
  {
    tripId: string;
    survivorId: string;
    cases: Record<string, { path: string; rows: CascadeReplayRow[] }>;
    expected?: CascadeReplayRow[];
  }
>();
Given("a scenario-owned cascade replay graph", async ({ page, scenario }) => {
  const { trip: target } = await scenario.materialize({
    trip: { mother: "threeDayTrip", setCurrent: false },
  });
  const survivorId = scenario.currentTrip!.id;
  const tripId = target!.id;
  await withE2EDb(async (database) => {
    const [day] = await database
      .select()
      .from(days)
      .where(and(eq(days.tripId, tripId), eq(days.dayNumber, 3)));
    const [survivorDay] = await database
      .select()
      .from(days)
      .where(and(eq(days.tripId, survivorId), eq(days.dayNumber, 1)));
    const [survivorChecklist] = await database
      .select()
      .from(itineraryChecklists)
      .where(eq(itineraryChecklists.dayId, survivorDay.id));
    const [event] = await database
      .insert(events)
      .values({
        tripId: survivorId,
        dayId: day.id,
        name: "Legacy cross-trip event",
        position: 0,
      })
      .returning({ id: events.id });
    const [reservation] = await database
      .insert(reservations)
      .values({
        tripId,
        type: "other",
        provider: "Cascade reservation",
      })
      .returning({ id: reservations.id });
    const [document] = await database
      .insert(documents)
      .values({
        tripId: survivorId,
        eventId: event.id,
        name: "Cascade document",
        kind: "pdf",
      })
      .returning({ id: documents.id });
    const [expense] = await database
      .insert(expenses)
      .values({
        tripId: survivorId,
        eventId: event.id,
        category: "misc",
        amount: "1",
        currency: "USD",
        date: "2030-01-01",
      })
      .returning({ id: expenses.id });
    const [reservationDocument] = await database
      .insert(documents)
      .values({
        tripId: survivorId,
        reservationId: reservation.id,
        name: "Cross-trip reservation document",
        kind: "pdf",
      })
      .returning({ id: documents.id });
    const [reservationExpense] = await database
      .insert(expenses)
      .values({
        tripId: survivorId,
        reservationId: reservation.id,
        category: "misc",
        amount: "1",
        currency: "USD",
        date: "2030-01-01",
      })
      .returning({ id: expenses.id });
    const [checklist] = await database
      .insert(itineraryChecklists)
      .values({
        dayId: day.id,
        position: 1,
      })
      .returning({ id: itineraryChecklists.id });
    const [checklistItem] = await database
      .insert(checklistItems)
      .values({
        checklistId: checklist.id,
        content: "Cascade checklist item",
      })
      .returning({ id: checklistItems.id });
    const [note] = await database
      .insert(itineraryNotes)
      .values({
        dayId: day.id,
        position: 2,
        content: "Cascade itinerary note",
      })
      .returning({ id: itineraryNotes.id });
    const [tripNote] = await database
      .insert(notes)
      .values({
        tripId,
        position: 0,
        title: "Cascade trip note",
        body: "",
      })
      .returning({ id: notes.id });
    const [list] = await database
      .insert(tripPackingLists)
      .values({
        tripId,
        position: 0,
        name: "Cascade packing list",
      })
      .returning({ id: tripPackingLists.id });
    const [packingItem] = await database
      .insert(packingItems)
      .values({
        tripId: survivorId,
        listId: list.id,
        position: 0,
        name: "Legacy cross-trip packing item",
      })
      .returning({ id: packingItems.id });

    const documentReplay = { resource: "document", id: document.id };
    const expenseReplay = {
      resource: "expense",
      id: expense.id,
      path: `/api/v1/trips/${survivorId}/expenses`,
      data: { category: ExpenseCategory.Misc, amount: 42, currency: "USD", date: "2030-01-01" },
    };
    const eventRows = [
      { resource: "event", id: event.id, path: `/api/v1/days/${survivorDay.id}/events`, data: { name: "Retry" } },
      documentReplay,
      expenseReplay,
    ];
    const checklistRows = [
      { resource: "checklist", id: checklist.id },
      {
        resource: "checklist-item",
        id: checklistItem.id,
        path: `/api/v1/checklists/${survivorChecklist.id}/items`,
        data: { content: "Retry" },
      },
    ];
    const dayRows = [
      { resource: "day", id: day.id },
      { resource: "itinerary-note", id: note.id },
      ...eventRows,
      ...checklistRows,
    ];
    const packingRows = [
      { resource: "packing-list", id: list.id },
      {
        resource: "packing-item",
        id: packingItem.id,
        path: `/api/v1/trips/${survivorId}/packing-items`,
        data: { name: "Retry", listId: null },
      },
    ];
    cascadeReplayGraphs.set(page, {
      tripId,
      survivorId,
      cases: {
        event: { path: `/api/v1/events/${event.id}`, rows: eventRows },
        day: { path: `/api/v1/days/${day.id}`, rows: dayRows },
        checklist: { path: `/api/v1/checklists/${checklist.id}`, rows: checklistRows },
        packing: { path: `/api/v1/packing-lists/${list.id}`, rows: packingRows },
        trip: {
          path: `/api/v1/trips/${tripId}`,
          rows: [
            { resource: "trip", id: tripId },
            { resource: "reservation", id: reservation.id },
            { resource: "document", id: reservationDocument.id },
            { ...expenseReplay, id: reservationExpense.id },
            { resource: "trip-note", id: tripNote.id },
            ...dayRows,
            ...packingRows,
          ],
        },
      },
    });
  });
});
When("I delete the cascade replay {string} through the API", async ({ page }, parent: string) => {
  const graph = cascadeReplayGraphs.get(page)!;
  const { path, rows } = graph.cases[parent];
  const data =
    parent === "trip"
      ? {}
      : {
          tripId: parent === "event" ? graph.survivorId : graph.tripId,
          ...(parent === "day" ? { confirmDestructive: true } : {}),
        };
  const response = await (await apiClient(page)).delete(path, { headers: headers(page), data });
  expect(response.status()).toBe(204);
  graph.expected = rows;
});
Then("the cascade replay IDs are recorded and cannot be recreated", async ({ page }) => {
  const graph = cascadeReplayGraphs.get(page)!;
  const expected = graph.expected!;
  const keys = expected.map(({ resource, id }) => `deleted:${resource}:${id}`).sort();
  const recorded = await withE2EDb((database) =>
    database.select({ key: idempotencyKeys.key }).from(idempotencyKeys).where(inArray(idempotencyKeys.key, keys))
  );
  expect(recorded.map(({ key }) => key).sort()).toEqual(keys);
  const client = await apiClient(page);
  for (const { resource, id, path, data } of expected) {
    if (path) {
      const response = await client.post(path, { headers: headers(page), data: { id, ...data } });
      expect(response.status()).toBe(409);
      expect((await response.json()).error.code).toBe("conflict");
    }
    if (resource === "document") {
      const { origin } = headers(page);
      const response = await client.post(`/api/v1/trips/${graph.survivorId}/documents`, {
        headers: { "x-arrivo-client": "web", origin },
        multipart: {
          id,
          file: { name: "retry.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") },
        },
      });
      expect(response.status()).toBe(409);
      expect((await response.json()).error.code).toBe("conflict");
    }
  }
});
