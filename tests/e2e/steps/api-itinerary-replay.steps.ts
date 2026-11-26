import { expect, type APIResponse, type Page } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
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
  trips,
} from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { E2E_TRIP_FOURTH_DATE } from "../e2e-seed-data";
import { apiClient } from "../anonymous-api";
import { When, Then } from "../fixtures";
import {
  REPLAY_KEY_PREFIX,
  dayOrderState,
  existingNoteId,
  headers,
  state,
  storedDayOrder,
  storedDays,
  storedTripNotes,
  tripNoteApi,
} from "../api-support";

// Exact descriptors survive deletion so replay tests never look up a deleted resource to rebuild the request.
interface ItineraryReplayRequest {
  method: "post" | "patch" | "put" | "delete";
  path: string;
  body: Record<string, unknown>;
}
interface ItineraryReplayState {
  actorId: string;
  request: ItineraryReplayRequest;
  snapshot: Awaited<ReturnType<typeof itineraryReplaySnapshot>>;
  response?: APIResponse;
}
const itineraryReplayStates = new WeakMap<Page, ItineraryReplayState>();
async function itineraryReplaySnapshot(tripId: string, actorId: string, key: string) {
  return withE2EDb(async (database) => {
    const dayRows = await database.select().from(days).where(eq(days.tripId, tripId)).orderBy(days.id);
    const dayIds = dayRows.map((day) => day.id);
    const checklistRows = await database
      .select()
      .from(itineraryChecklists)
      .where(inArray(itineraryChecklists.dayId, dayIds))
      .orderBy(itineraryChecklists.id);
    return {
      replayRecords: await database
        .select()
        .from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.userId, actorId), eq(idempotencyKeys.key, `${REPLAY_KEY_PREFIX}${key}`))),
      trips: await database.select().from(trips).where(eq(trips.id, tripId)),
      days: dayRows,
      events: await database.select().from(events).where(eq(events.tripId, tripId)).orderBy(events.id),
      dayNotes: await database
        .select()
        .from(itineraryNotes)
        .where(inArray(itineraryNotes.dayId, dayIds))
        .orderBy(itineraryNotes.id),
      tripNotes: await database.select().from(notes).where(eq(notes.tripId, tripId)).orderBy(notes.id),
      checklists: checklistRows,
      items: await database
        .select()
        .from(checklistItems)
        .where(
          inArray(
            checklistItems.checklistId,
            checklistRows.map((checklist) => checklist.id)
          )
        )
        .orderBy(checklistItems.id),
      documents: await database.select().from(documents).where(eq(documents.tripId, tripId)).orderBy(documents.id),
      expenses: await database.select().from(expenses).where(eq(expenses.tripId, tripId)).orderBy(expenses.id),
    };
  });
}
async function sendItineraryReplay(page: Page, request: ItineraryReplayRequest) {
  return (await apiClient(page))[request.method](request.path, {
    headers: { ...headers(page), "idempotency-key": state(page).key },
    data: request.body,
  });
}
When("I commit the keyed itinerary operation {string}", async ({ page, scenario }, operation: string) => {
  const actorId = scenario.currentUser!.id;
  const { tripId, dayId, original } = dayOrderState(page);
  const eventId = original.find((item) => item.type === "event")!.id;
  const noteId = existingNoteId(page);
  const tripNoteId = tripNoteApi(page).original[0];
  const originalDays = await storedDays(tripId);
  const clientId = randomUUID();
  const requests: Record<string, ItineraryReplayRequest> = {
    "event-create": {
      method: "post",
      path: `/api/v1/days/${dayId}/events`,
      body: { id: clientId, name: "Replay event", insertAtPosition: 1 },
    },
    "event-edit": {
      method: "patch",
      path: `/api/v1/events/${eventId}`,
      body: { name: "Replay edited event", note: "Persisted event body" },
    },
    "event-delete": { method: "delete", path: `/api/v1/events/${eventId}`, body: { tripId } },
    "day-order": { method: "put", path: `/api/v1/days/${dayId}/order`, body: { items: [...original].reverse() } },
    "day-note-create": {
      method: "post",
      path: `/api/v1/days/${dayId}/notes`,
      body: { id: clientId, content: "Replay day note", insertAtPosition: 1 },
    },
    "day-note-edit": {
      method: "patch",
      path: `/api/v1/itinerary-notes/${noteId}`,
      body: { content: "Replay edited day note" },
    },
    "day-note-delete": { method: "delete", path: `/api/v1/itinerary-notes/${noteId}`, body: { tripId } },
    "trip-note-create": {
      method: "post",
      path: `/api/v1/trips/${tripId}/notes`,
      body: { id: clientId, title: "Replay trip note", body: "Persisted trip body" },
    },
    "trip-note-edit": {
      method: "patch",
      path: `/api/v1/notes/${tripNoteId}`,
      body: { title: "Replay edited trip note", body: "Persisted edited body" },
    },
    "trip-note-delete": { method: "delete", path: `/api/v1/notes/${tripNoteId}`, body: { tripId } },
    "trip-note-order": {
      method: "put",
      path: `/api/v1/trips/${tripId}/notes/order`,
      body: { noteIds: [...tripNoteApi(page).original].reverse() },
    },
    "day-edit": {
      method: "patch",
      path: `/api/v1/days/${dayId}`,
      body: { label: "Replay edited day", subtitle: "Persisted subtitle" },
    },
    "day-append": { method: "post", path: `/api/v1/trips/${tripId}/days`, body: { id: clientId } },
    "day-delete": { method: "delete", path: `/api/v1/days/${originalDays[2].id}`, body: { tripId } },
  };
  const request = requests[operation];
  expect(request, `Unknown itinerary operation ${operation}`).toBeDefined();
  const before = await itineraryReplaySnapshot(tripId, actorId, state(page).key);
  expect(before.replayRecords).toHaveLength(0);
  const response = await sendItineraryReplay(page, request);
  expect(response.status()).toBe(request.method === "delete" ? 204 : 200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const initialResponse = request.method === "delete" ? null : await response.json();
  const snapshot = await itineraryReplaySnapshot(tripId, actorId, state(page).key);
  expect(snapshot.replayRecords).toHaveLength(1);
  expect(snapshot.replayRecords[0].result).toMatchObject({ response: initialResponse });
  expect(snapshot).not.toEqual(before);
  if (operation === "event-create")
    expect(snapshot.events.find((row) => row.id === clientId)).toMatchObject({ name: "Replay event", position: 1 });
  if (operation === "event-edit") expect(snapshot.events.find((row) => row.id === eventId)).toMatchObject(request.body);
  if (operation === "event-delete") expect(snapshot.events.some((row) => row.id === eventId)).toBe(false);
  if (operation === "day-order") expect(await storedDayOrder(dayId)).toEqual([...original].reverse());
  if (operation === "day-note-create")
    expect(snapshot.dayNotes.find((row) => row.id === clientId)).toMatchObject({
      content: "Replay day note",
      position: 1,
    });
  if (operation === "day-note-edit")
    expect(snapshot.dayNotes.find((row) => row.id === noteId)).toMatchObject(request.body);
  if (operation === "day-note-delete") expect(snapshot.dayNotes.some((row) => row.id === noteId)).toBe(false);
  if (operation === "trip-note-create")
    expect(snapshot.tripNotes.find((row) => row.id === clientId)).toMatchObject({
      title: "Replay trip note",
      body: "Persisted trip body",
      position: 0,
    });
  if (operation === "trip-note-edit")
    expect(snapshot.tripNotes.find((row) => row.id === tripNoteId)).toMatchObject(request.body);
  if (operation === "trip-note-delete") expect(snapshot.tripNotes.some((row) => row.id === tripNoteId)).toBe(false);
  if (operation === "trip-note-order")
    expect((await storedTripNotes(tripId)).map((row) => row.id)).toEqual([...tripNoteApi(page).original].reverse());
  if (operation === "day-edit") expect(snapshot.days.find((row) => row.id === dayId)).toMatchObject(request.body);
  if (operation === "day-append") {
    expect(snapshot.days).toHaveLength(4);
    expect(snapshot.days.find((row) => row.id === clientId)).toMatchObject({
      dayNumber: 4,
      date: E2E_TRIP_FOURTH_DATE,
    });
    expect(snapshot.trips[0].endDate).toBe(E2E_TRIP_FOURTH_DATE);
  }
  if (operation === "day-delete") {
    expect(snapshot.days).toHaveLength(2);
    expect(snapshot.days.some((row) => row.id === originalDays[2].id)).toBe(false);
    expect(snapshot.trips[0].endDate).toBe(originalDays[1].date);
  }
  itineraryReplayStates.set(page, { actorId, request, snapshot });
});
When("I replay the exact committed itinerary request", async ({ page }) => {
  const current = itineraryReplayStates.get(page)!;
  current.response = await sendItineraryReplay(page, current.request);
});
Then(
  "the itinerary replay returns {int} with code {string} and preserves the committed snapshot",
  async ({ page }, status: number, code: string) => {
    const current = itineraryReplayStates.get(page)!;
    expect(current.response!.status()).toBe(status);
    expect(current.response!.headers()["cache-control"]).toBe("no-store");
    expect(await current.response!.json()).toEqual({
      error:
        code === "forbidden"
          ? { code, message: "You do not have permission for this action.", requiredRole: "editor" }
          : { code, message: "Resource not found." },
    });
    expect(await itineraryReplaySnapshot(dayOrderState(page).tripId, current.actorId, state(page).key)).toEqual(
      current.snapshot
    );
  }
);
