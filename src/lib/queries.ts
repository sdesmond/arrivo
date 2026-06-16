import "server-only";
import { db } from "@/db";
import {
  trips,
  days,
  events,
  documents,
  reservations,
  collaborators,
  packingItems,
  tripPackingLists,
  itineraryNotes,
  itineraryChecklists,
  checklistItems,
  users,
  userLoyaltyNumbers,
  userWishlistDestinations,
  userCompanions,
  packingTemplates,
  packingTemplateItems,
} from "@/db/schema";
import { eq, and, sql, inArray, asc, count, isNull } from "drizzle-orm";
import { assertTripAccess } from "@/lib/auth-helpers";
import {
  dbTripToType,
  dbEventToType,
  dbDocToType,
  dbReservationToType,
  dbCollabToType,
  dbChecklistToType,
  dbLoyaltyToType,
  dbWishlistToType,
  dbCompanionToType,
  dbPackingItemToType,
  dbPackingListToType,
  dbTemplateToType,
  dbTemplateItemToType,
} from "@/lib/db-mappers";
import { CoverType } from "@/data/types";
import type { PackingTemplate, PackingTemplateItem, TripListEntry, TripDetailPayload, UserProfile } from "@/data/types";

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

  if (rows.length === 0) return [];

  const todayISO = now.toISOString().slice(0, 10);
  const tripIds = rows.map(({ trip }) => trip.id);

  const [allTodayEvents, dayCountAggs, packingAggs, allDocs, allCollabs] = await Promise.all([
    db
      .select()
      .from(events)
      .where(and(inArray(events.tripId, tripIds), sql`${events.startAt}::date = ${todayISO}::date`))
      .orderBy(events.position),
    db
      .select({
        tripId: days.tripId,
        dayTotal: count(),
      })
      .from(days)
      .where(inArray(days.tripId, tripIds))
      .groupBy(days.tripId),
    db
      .select({
        tripId: packingItems.tripId,
        total: count(),
        checked: sql<number>`count(*) filter (where ${packingItems.done})::int`,
      })
      .from(packingItems)
      .where(and(inArray(packingItems.tripId, tripIds), eq(packingItems.isLabel, false)))
      .groupBy(packingItems.tripId),
    db
      .select()
      .from(documents)
      .where(and(inArray(documents.tripId, tripIds), isNull(documents.eventId))),
    db.select().from(collaborators).where(inArray(collaborators.tripId, tripIds)),
  ]);

  type EventRow = (typeof allTodayEvents)[number];
  type DocRow = (typeof allDocs)[number];
  type CollabRow = (typeof allCollabs)[number];
  type PackAgg = (typeof packingAggs)[number];

  const eventsByTrip = allTodayEvents.reduce<Record<string, EventRow[]>>((acc, eventRow) => {
    (acc[eventRow.tripId] ??= []).push(eventRow);
    return acc;
  }, {});
  const dayTotalsByTrip = dayCountAggs.reduce<Record<string, number>>((acc, dayCountAgg) => {
    acc[dayCountAgg.tripId] = dayCountAgg.dayTotal;
    return acc;
  }, {});
  const packingByTrip = packingAggs.reduce<Record<string, PackAgg>>((acc, packAgg) => {
    acc[packAgg.tripId] = packAgg;
    return acc;
  }, {});
  const docsByTrip = allDocs.reduce<Record<string, DocRow[]>>((acc, docRow) => {
    (acc[docRow.tripId!] ??= []).push(docRow);
    return acc;
  }, {});
  const collabsByTrip = allCollabs.reduce<Record<string, CollabRow[]>>((acc, collabRow) => {
    (acc[collabRow.tripId] ??= []).push(collabRow);
    return acc;
  }, {});

  return rows.map(({ trip }) => {
    const packAgg = packingByTrip[trip.id];
    const packingProgress =
      packAgg && packAgg.total > 0 ? { checked: packAgg.checked, total: packAgg.total } : undefined;
    const tripEntry = dbTripToType(trip);
    return {
      trip: {
        ...tripEntry,
        dayTotal: dayTotalsByTrip[trip.id] ?? tripEntry.dayTotal,
        packingProgress,
        docs: (docsByTrip[trip.id] ?? []).map(dbDocToType),
        collaborators: (collabsByTrip[trip.id] ?? [])
          .filter((collabRow) => collabRow.userId !== userId)
          .map(dbCollabToType),
      },
      todayEvents: (eventsByTrip[trip.id] ?? []).map(dbEventToType),
    };
  });
}

export async function listTemplatesForUser(userId: string): Promise<PackingTemplate[]> {
  const rows = await db
    .select()
    .from(packingTemplates)
    .where(eq(packingTemplates.userId, userId))
    .orderBy(asc(sql`LOWER(${packingTemplates.name})`), asc(packingTemplates.createdAt), asc(packingTemplates.id));

  return rows.map(dbTemplateToType);
}

export async function getTemplateWithItems(
  templateId: string,
  userId: string
): Promise<{ template: PackingTemplate; items: PackingTemplateItem[] } | null> {
  const [templateRow] = await db
    .select()
    .from(packingTemplates)
    .where(and(eq(packingTemplates.id, templateId), eq(packingTemplates.userId, userId)));

  if (!templateRow) {
    return null;
  }

  const itemRows = await db
    .select()
    .from(packingTemplateItems)
    .where(eq(packingTemplateItems.templateId, templateId))
    .orderBy(asc(packingTemplateItems.position));

  return {
    template: dbTemplateToType(templateRow),
    items: itemRows.map(dbTemplateItemToType),
  };
}

export async function getTripDetail(tripId: string, userId: string): Promise<TripDetailPayload | null> {
  await assertTripAccess(tripId, userId);

  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
  if (!trip) return null;

  const tripDays = await db.select().from(days).where(eq(days.tripId, tripId)).orderBy(days.dayNumber);

  const tripEvents = await db.select().from(events).where(eq(events.tripId, tripId)).orderBy(events.position);

  const tripDocs = await db
    .select()
    .from(documents)
    .where(eq(documents.tripId, tripId))
    .orderBy(sql`${documents.addedAt} desc nulls last`, asc(documents.id));
  const tripCollaborators = (await db.select().from(collaborators).where(eq(collaborators.tripId, tripId))).filter(
    (collaborator) => collaborator.userId !== userId
  );
  const tripPackingItems = await db
    .select()
    .from(packingItems)
    .where(eq(packingItems.tripId, tripId))
    .orderBy(packingItems.position);

  const tripPackingListRows = await db
    .select()
    .from(tripPackingLists)
    .where(eq(tripPackingLists.tripId, tripId))
    .orderBy(asc(tripPackingLists.position));

  const tripReservations = await db.select().from(reservations).where(eq(reservations.tripId, tripId));

  const reservationIds = tripReservations.map((row) => row.id);
  const reservationDocRows =
    reservationIds.length > 0
      ? await db.select().from(documents).where(inArray(documents.reservationId, reservationIds))
      : [];
  const docsByReservationId = new Map<string, (typeof documents.$inferSelect)[]>();
  for (const docRow of reservationDocRows) {
    if (!docRow.reservationId) continue;
    const existing = docsByReservationId.get(docRow.reservationId) ?? [];
    existing.push(docRow);
    docsByReservationId.set(docRow.reservationId, existing);
  }

  const allNotes =
    tripDays.length > 0
      ? await db
          .select()
          .from(itineraryNotes)
          .where(
            inArray(
              itineraryNotes.dayId,
              tripDays.map((day) => day.id)
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
              tripDays.map((day) => day.id)
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

  const eventIds = tripEvents.map((event) => event.id);
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
      notes: (notesByDay.get(day.id) ?? []).map((note) => ({
        id: note.id,
        content: note.content,
        position: note.position,
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
    packingLists: tripPackingListRows.map(dbPackingListToType),
    reservations: tripReservations.map((row) => ({
      ...dbReservationToType(row),
      documents: (docsByReservationId.get(row.id) ?? []).map(dbDocToType),
    })),
  };
}
