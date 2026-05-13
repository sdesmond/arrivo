import "server-only";
import { db } from "@/db";
import { trips, days, events, documents, collaborators, packingItems } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { assertTripAccess } from "@/lib/auth-helpers";
import { getTripStatus } from "@/lib/utils";
import type { TripListEntry, TripDetailPayload, Trip, TripEvent, Document, Collaborator, DocPreviewLine } from "@/data/types";

export async function listTripsForUser(userId: string, now: Date): Promise<TripListEntry[]> {
  const rows = await db
    .select({ trip: trips })
    .from(trips)
    .innerJoin(collaborators, and(
      eq(collaborators.tripId, trips.id),
      eq(collaborators.userId, userId),
    ))
    .orderBy(trips.startDate);

  const todayISO = now.toISOString().slice(0, 10);

  const result: TripListEntry[] = await Promise.all(
    rows.map(async ({ trip }) => {
      const todayEvents = await db
        .select()
        .from(events)
        .where(and(
          eq(events.tripId, trip.id),
          sql`${events.startAt}::date = ${todayISO}::date`,
        ))
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

  const tripDays = await db
    .select()
    .from(days)
    .where(eq(days.tripId, tripId))
    .orderBy(days.dayNumber);

  const tripEvents = await db
    .select()
    .from(events)
    .where(eq(events.tripId, tripId))
    .orderBy(events.position);

  const tripDocs = await db.select().from(documents).where(eq(documents.tripId, tripId));
  const tripCollaborators = await db.select().from(collaborators).where(eq(collaborators.tripId, tripId));
  const tripPackingItems = await db
    .select()
    .from(packingItems)
    .where(eq(packingItems.tripId, tripId))
    .orderBy(packingItems.position);

  const eventsByDay = new Map<string, typeof tripEvents>();
  for (const event of tripEvents) {
    const arr = eventsByDay.get(event.dayId) ?? [];
    arr.push(event);
    eventsByDay.set(event.dayId, arr);
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
      events: (eventsByDay.get(d.id) ?? []).map(dbEventToType),
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

// ── DB row → type mappers ────────────────────────────────────────────────────

function dbTripToType(row: typeof trips.$inferSelect): Trip {
  return {
    id: row.id,
    name: row.name,
    startDate: row.startDate,
    endDate: row.endDate,
    status: getTripStatus(row.startDate, row.endDate),
    coverImageUrl: row.coverImageUrl ?? undefined,
    notes: row.notes ?? undefined,
    budget: row.budgetTotal
      ? { currency: row.budgetCurrency ?? "USD", total: Number(row.budgetTotal), perPerson: Number(row.budgetPerPerson ?? 0) }
      : undefined,
    tags: row.tags ?? [],
  };
}

function dbEventToType(row: typeof events.$inferSelect): TripEvent {
  return {
    id: row.id,
    name: row.name,
    startAt: row.startAt?.toISOString() ?? undefined,
    endAt: row.endAt?.toISOString() ?? undefined,
    locationName: row.locationName ?? undefined,
    locationAddress: row.locationAddress ?? undefined,
    locationLat: row.locationLat ?? undefined,
    locationLng: row.locationLng ?? undefined,
    cost: row.cost ? Number(row.cost) : undefined,
    confirmationNumber: row.confirmationNumber ?? undefined,
    note: row.note ?? undefined,
    position: row.position,
  };
}

function dbDocToType(row: typeof documents.$inferSelect): Document {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as Document["kind"],
    size: row.size ?? undefined,
    offline: row.offline ?? false,
    url: row.url ?? undefined,
    scope: row.tripId ? "trip" : "event",
    previewLines: row.previewLines as DocPreviewLine[] | undefined,
    addedAt: row.addedAt?.toISOString() ?? new Date().toISOString(),
  };
}

function dbCollabToType(row: typeof collaborators.$inferSelect): Collaborator {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    initials: row.initials,
    role: row.role as Collaborator["role"],
    tintBg: row.tintBg ?? undefined,
    tintFg: row.tintFg ?? undefined,
  };
}
