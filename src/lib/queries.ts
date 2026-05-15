import "server-only";
import { db } from "@/db";
import {
  trips,
  days,
  events,
  documents,
  collaborators,
  packingItems,
  itineraryNotes,
  itineraryChecklists,
  checklistItems,
} from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { assertTripAccess } from "@/lib/auth-helpers";
import { dbTripToType, dbEventToType, dbDocToType, dbCollabToType, dbChecklistToType } from "@/lib/db-mappers";
import type { TripListEntry, TripDetailPayload } from "@/data/types";

export async function listTripsForUser(userId: string, now: Date): Promise<TripListEntry[]> {
  const rows = await db
    .select({ trip: trips })
    .from(trips)
    .innerJoin(collaborators, and(eq(collaborators.tripId, trips.id), eq(collaborators.userId, userId)))
    .orderBy(trips.startDate);

  const todayISO = now.toISOString().slice(0, 10);

  const result: TripListEntry[] = await Promise.all(
    rows.map(async ({ trip }) => {
      const todayEvents = await db
        .select()
        .from(events)
        .where(and(eq(events.tripId, trip.id), sql`${events.startAt}::date = ${todayISO}::date`))
        .orderBy(events.position);

      return {
        trip: dbTripToType(trip),
        todayEvents: todayEvents.map(dbEventToType),
      };
    })
  );

  return result;
}

export async function getTripDetail(tripId: string, userId: string): Promise<TripDetailPayload> {
  await assertTripAccess(tripId, userId);

  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
  if (!trip) throw new Error("Trip not found");

  const tripDays = await db.select().from(days).where(eq(days.tripId, tripId)).orderBy(days.dayNumber);

  const tripEvents = await db.select().from(events).where(eq(events.tripId, tripId)).orderBy(events.position);

  const tripDocs = await db.select().from(documents).where(eq(documents.tripId, tripId));
  const tripCollaborators = await db.select().from(collaborators).where(eq(collaborators.tripId, tripId));
  const tripPackingItems = await db
    .select()
    .from(packingItems)
    .where(eq(packingItems.tripId, tripId))
    .orderBy(packingItems.position);

  const allNotes =
    tripDays.length > 0
      ? await db
          .select()
          .from(itineraryNotes)
          .where(
            inArray(
              itineraryNotes.dayId,
              tripDays.map((d) => d.id)
            )
          )
          .orderBy(itineraryNotes.position)
      : [];

  const allChecklists =
    tripDays.length > 0
      ? await db
          .select()
          .from(itineraryChecklists)
          .where(
            inArray(
              itineraryChecklists.dayId,
              tripDays.map((d) => d.id)
            )
          )
          .orderBy(itineraryChecklists.position)
      : [];

  const checklistIds = allChecklists.map((cl) => cl.id);
  const allChecklistItems =
    checklistIds.length > 0
      ? await db
          .select()
          .from(checklistItems)
          .where(inArray(checklistItems.checklistId, checklistIds))
          .orderBy(checklistItems.createdAt)
      : [];

  const eventIds = tripEvents.map((e) => e.id);
  const eventDocs =
    eventIds.length > 0 ? await db.select().from(documents).where(inArray(documents.eventId, eventIds)) : [];

  const eventsByDay = new Map<string, typeof tripEvents>();
  for (const event of tripEvents) {
    const arr = eventsByDay.get(event.dayId) ?? [];
    arr.push(event);
    eventsByDay.set(event.dayId, arr);
  }

  const notesByDay = new Map<string, typeof allNotes>();
  for (const note of allNotes) {
    const arr = notesByDay.get(note.dayId) ?? [];
    arr.push(note);
    notesByDay.set(note.dayId, arr);
  }

  const checklistsByDay = new Map<string, typeof allChecklists>();
  for (const cl of allChecklists) {
    const arr = checklistsByDay.get(cl.dayId) ?? [];
    arr.push(cl);
    checklistsByDay.set(cl.dayId, arr);
  }

  const itemsByChecklistId = new Map<string, typeof allChecklistItems>();
  for (const item of allChecklistItems) {
    const arr = itemsByChecklistId.get(item.checklistId) ?? [];
    arr.push(item);
    itemsByChecklistId.set(item.checklistId, arr);
  }

  const docsByEventId = new Map<string, typeof eventDocs>();
  for (const doc of eventDocs) {
    if (doc.eventId) {
      const arr = docsByEventId.get(doc.eventId) ?? [];
      arr.push(doc);
      docsByEventId.set(doc.eventId, arr);
    }
  }

  return {
    trip: dbTripToType(trip),
    days: tripDays.map((d) => ({
      id: d.id,
      dayNumber: d.dayNumber,
      date: d.date ?? undefined,
      label: d.label,
      subtitle: d.subtitle ?? undefined,
      weather: d.weather ?? undefined,
      travelSummary: d.travelSummary ?? undefined,
      events: (eventsByDay.get(d.id) ?? []).map((e) => ({
        ...dbEventToType(e),
        docs: (docsByEventId.get(e.id) ?? []).map(dbDocToType),
      })),
      notes: (notesByDay.get(d.id) ?? []).map((n) => ({
        id: n.id,
        content: n.content,
        position: n.position,
      })),
      checklists: (checklistsByDay.get(d.id) ?? []).map((cl) =>
        dbChecklistToType(cl, itemsByChecklistId.get(cl.id) ?? [])
      ),
    })),
    docs: tripDocs.map(dbDocToType),
    collaborators: tripCollaborators.map(dbCollabToType),
    packingItems: tripPackingItems.map((p) => ({
      id: p.id,
      name: p.name,
      done: p.done ?? false,
      position: p.position,
    })),
  };
}
