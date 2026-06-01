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
  users,
  userLoyaltyNumbers,
  userWishlistDestinations,
  userCompanions,
} from "@/db/schema";
import { eq, and, sql, inArray, asc, count } from "drizzle-orm";
import { assertTripAccess } from "@/lib/auth-helpers";
import {
  dbTripToType,
  dbEventToType,
  dbDocToType,
  dbCollabToType,
  dbChecklistToType,
  dbLoyaltyToType,
  dbWishlistToType,
  dbCompanionToType,
  dbPackingItemToType,
} from "@/lib/db-mappers";
import { CoverType } from "@/data/types";
import type { TripListEntry, TripDetailPayload, UserProfile } from "@/data/types";

const VALID_COVER_TYPES = Object.values(CoverType) as string[];

function parseCoverType(val: string | null): UserProfile["defaultCoverType"] {
  if (!val) return undefined;
  return VALID_COVER_TYPES.includes(val) ? (val as UserProfile["defaultCoverType"]) : undefined;
}

export async function getUserById(id: string): Promise<UserProfile | null> {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      dateFormat: users.dateFormat,
      currency: users.currency,
      distanceUnit: users.distanceUnit,
      passportNumber: users.passportNumber,
      passportExpiry: users.passportExpiry,
      passportNationality: users.passportNationality,
      knownTravelerNumber: users.knownTravelerNumber,
      defaultCoverType: users.defaultCoverType,
    })
    .from(users)
    .where(eq(users.id, id));

  if (!user || !user.email) return null;

  const [loyaltyRows, wishlistRows, companionRows] = await Promise.all([
    db
      .select()
      .from(userLoyaltyNumbers)
      .where(eq(userLoyaltyNumbers.userId, id))
      .orderBy(asc(userLoyaltyNumbers.position)),
    db
      .select()
      .from(userWishlistDestinations)
      .where(eq(userWishlistDestinations.userId, id))
      .orderBy(asc(userWishlistDestinations.position)),
    db.select().from(userCompanions).where(eq(userCompanions.userId, id)).orderBy(asc(userCompanions.position)),
  ]);

  return {
    ...user,
    email: user.email,
    defaultCoverType: parseCoverType(user.defaultCoverType),
    loyaltyNumbers: loyaltyRows.map(dbLoyaltyToType),
    wishlistDestinations: wishlistRows.map(dbWishlistToType),
    companions: companionRows.map(dbCompanionToType),
  };
}

export async function listTripsForUser(userId: string, now: Date): Promise<TripListEntry[]> {
  const rows = await db
    .select({ trip: trips })
    .from(trips)
    .innerJoin(collaborators, and(eq(collaborators.tripId, trips.id), eq(collaborators.userId, userId)))
    .orderBy(sql`${trips.startDate} NULLS FIRST`, trips.name);

  const todayISO = now.toISOString().slice(0, 10);

  const result: TripListEntry[] = await Promise.all(
    rows.map(async ({ trip }) => {
      const todayEvents = await db
        .select()
        .from(events)
        .where(and(eq(events.tripId, trip.id), sql`${events.startAt}::date = ${todayISO}::date`))
        .orderBy(events.position);

      const [{ totalItems }] = await db
        .select({ totalItems: count() })
        .from(packingItems)
        .where(and(eq(packingItems.tripId, trip.id), eq(packingItems.isLabel, false)));

      const [{ checkedItems }] = await db
        .select({ checkedItems: count() })
        .from(packingItems)
        .where(and(eq(packingItems.tripId, trip.id), eq(packingItems.isLabel, false), eq(packingItems.done, true)));

      const packingProgress = totalItems > 0 ? { checked: checkedItems, total: totalItems } : undefined;

      const tripEntry = dbTripToType(trip);
      return {
        trip: { ...tripEntry, packingProgress },
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

  const tripDocs = await db
    .select()
    .from(documents)
    .where(eq(documents.tripId, tripId))
    .orderBy(sql`${documents.addedAt} desc nulls last`, asc(documents.id));
  const tripCollaborators = (await db.select().from(collaborators).where(eq(collaborators.tripId, tripId))).filter(
    (c) => c.userId !== userId
  );
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

  const checklistIds = allChecklists.map((checklist) => checklist.id);
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

  const scheduledEvents = tripEvents.filter((event) => !!event.dayId);
  const unscheduledEvents = tripEvents
    .filter((event) => !event.dayId)
    .sort((first, second) => {
      const firstDate = first.displacedDate ?? first.startAt?.toISOString().slice(0, 10) ?? "";
      const secondDate = second.displacedDate ?? second.startAt?.toISOString().slice(0, 10) ?? "";
      if (firstDate !== secondDate) return firstDate.localeCompare(secondDate);
      return first.position - second.position;
    });

  const eventsByDay = new Map<string, typeof scheduledEvents>();
  for (const event of scheduledEvents) {
    if (!event.dayId) continue;
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
  for (const checklist of allChecklists) {
    const arr = checklistsByDay.get(checklist.dayId) ?? [];
    arr.push(checklist);
    checklistsByDay.set(checklist.dayId, arr);
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
    days: tripDays.map((day) => ({
      id: day.id,
      dayNumber: day.dayNumber,
      date: day.date ?? undefined,
      label: day.label,
      subtitle: day.subtitle ?? undefined,
      weather: day.weather ?? undefined,
      travelSummary: day.travelSummary ?? undefined,
      events: (eventsByDay.get(day.id) ?? []).map((event) => ({
        ...dbEventToType(event),
        docs: (docsByEventId.get(event.id) ?? []).map(dbDocToType),
      })),
      notes: (notesByDay.get(day.id) ?? []).map((n) => ({
        id: n.id,
        content: n.content,
        position: n.position,
      })),
      checklists: (checklistsByDay.get(day.id) ?? []).map((checklist) =>
        dbChecklistToType(checklist, itemsByChecklistId.get(checklist.id) ?? [])
      ),
    })),
    unscheduledEvents: unscheduledEvents.map((event) => ({
      ...dbEventToType(event),
      docs: (docsByEventId.get(event.id) ?? []).map(dbDocToType),
    })),
    docs: tripDocs.map(dbDocToType),
    collaborators: tripCollaborators.map(dbCollabToType),
    packingItems: tripPackingItems.map(dbPackingItemToType),
  };
}
