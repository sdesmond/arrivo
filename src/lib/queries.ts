import "server-only";
import { db } from "@/db";
import {
  trips,
  days,
  events,
  expenses,
  documents,
  reservations,
  collaborators,
  packingItems,
  tripPackingLists,
  itineraryNotes,
  notes,
  itineraryChecklists,
  checklistItems,
  users,
  userLoyaltyNumbers,
  userWishlistDestinations,
  userCompanions,
  packingTemplates,
  packingTemplateItems,
} from "@/db/schema";
import { eq, and, or, sql, inArray, asc, count, isNull } from "drizzle-orm";
import { assertTripAccess } from "@/lib/auth-helpers";
import { deriveLinkedEvents } from "@/lib/linked-events";
import {
  dbTripToType,
  dbEventToType,
  dbDocToType,
  dbReservationToType,
  dbExpenseToType,
  dbCollabToType,
  dbChecklistToType,
  dbTripNoteToType,
  dbLoyaltyToType,
  dbWishlistToType,
  dbCompanionToType,
  dbPackingItemToType,
  dbPackingListToType,
  dbTemplateToType,
  dbTemplateItemToType,
  isTransitMode,
} from "@/lib/db-mappers";
import { CoverType } from "@/data/types";
import { getTripStatus, getWallClockDateKey, toLocalDateKey } from "@/lib/utils";
import type {
  PackingTemplate,
  PackingTemplateItem,
  TripListEntry,
  TripDetailPayload,
  UserProfile,
  Trip,
  Expense,
} from "@/data/types";

const VALID_COVER_TYPES = Object.values(CoverType) as string[];

function parseCoverType(val: string | null): UserProfile["defaultCoverType"] {
  if (!val) return undefined;
  return VALID_COVER_TYPES.includes(val) ? (val as UserProfile["defaultCoverType"]) : undefined;
}

function parseTransitMode(val: string | null): UserProfile["transitMode"] {
  if (!val) return undefined;
  return isTransitMode(val) ? val : undefined;
}

function isSummaryEventInWindow(event: { startAt?: string }, todayISO: string, tripEndDate?: string): boolean {
  if (!event.startAt) return false;
  const eventDate = event.startAt.slice(0, 10);
  if (eventDate < todayISO) return false;
  return !tripEndDate || eventDate <= tripEndDate;
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
      warningThreshold: users.warningThreshold,
      dangerThreshold: users.dangerThreshold,
      transitMode: users.transitMode,
      walkThresholdMeters: users.walkThresholdMeters,
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
    transitMode: parseTransitMode(user.transitMode),
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

  const todayISO = getWallClockDateKey(now);
  const tripIds = rows.map(({ trip }) => trip.id);

  const [allTodayEvents, allSummaryEvents, dayCountAggs, packingAggs, allDocs, allCollabs, allReservations] =
    await Promise.all([
      db
        .select()
        .from(events)
        .where(and(inArray(events.tripId, tripIds), sql`${events.startAt}::date = ${todayISO}::date`))
        .orderBy(events.position),
      db
        .select()
        .from(events)
        .where(and(inArray(events.tripId, tripIds), sql`${events.startAt}::date >= ${todayISO}::date`))
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
      db.select().from(reservations).where(inArray(reservations.tripId, tripIds)),
    ]);

  type EventRow = (typeof allTodayEvents)[number];
  type DocRow = (typeof allDocs)[number];
  type CollabRow = (typeof allCollabs)[number];
  type PackAgg = (typeof packingAggs)[number];
  type ReservationRow = (typeof allReservations)[number];

  const eventsByTrip = allTodayEvents.reduce<Record<string, EventRow[]>>((acc, eventRow) => {
    (acc[eventRow.tripId] ??= []).push(eventRow);
    return acc;
  }, {});
  const summaryEventsByTrip = allSummaryEvents.reduce<Record<string, EventRow[]>>((acc, eventRow) => {
    (acc[eventRow.tripId] ??= []).push(eventRow);
    return acc;
  }, {});
  const reservationsByTrip = allReservations.reduce<Record<string, ReservationRow[]>>((acc, reservationRow) => {
    (acc[reservationRow.tripId] ??= []).push(reservationRow);
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

    const linkedEventsForTrip = deriveLinkedEvents((reservationsByTrip[trip.id] ?? []).map(dbReservationToType));
    const todayLinkedEvents = linkedEventsForTrip.filter(
      (linkedEvent) => !!linkedEvent.startAt && linkedEvent.startAt.slice(0, 10) === todayISO
    );
    const todayEvents = [...todayLinkedEvents, ...(eventsByTrip[trip.id] ?? []).map(dbEventToType)]
      .filter((event) => event.startAt)
      .sort((first, second) => new Date(first.startAt!).getTime() - new Date(second.startAt!).getTime());
    const isActiveTrip = getTripStatus(tripEntry.startDate, tripEntry.endDate, now) === "active";
    const summaryLinkedEvents = isActiveTrip
      ? linkedEventsForTrip.filter((linkedEvent) => isSummaryEventInWindow(linkedEvent, todayISO, tripEntry.endDate))
      : [];
    const summaryEvents = isActiveTrip
      ? [...summaryLinkedEvents, ...(summaryEventsByTrip[trip.id] ?? []).map(dbEventToType)]
          .filter((event) => isSummaryEventInWindow(event, todayISO, tripEntry.endDate))
          .sort((first, second) => new Date(first.startAt!).getTime() - new Date(second.startAt!).getTime())
      : [];

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
      todayEvents,
      summaryEvents,
    };
  });
}

export async function listExpensesForUserInRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<{ trips: Trip[]; expenses: Expense[] }> {
  const tripRows = await db
    .select({ trip: trips })
    .from(trips)
    .innerJoin(collaborators, and(eq(collaborators.tripId, trips.id), eq(collaborators.userId, userId)))
    .where(
      or(
        isNull(trips.startDate),
        isNull(trips.endDate),
        and(sql`${trips.startDate} <= ${endDate}`, sql`${trips.endDate} >= ${startDate}`)
      )
    );

  const tripList = tripRows.map(({ trip }) => trip);
  if (tripList.length === 0) {
    return { trips: [], expenses: [] };
  }

  const tripIds = tripList.map((trip) => trip.id);
  const [expenseRows, dayCountAggs] = await Promise.all([
    db.select().from(expenses).where(inArray(expenses.tripId, tripIds)),
    db
      .select({ tripId: days.tripId, dayTotal: count() })
      .from(days)
      .where(inArray(days.tripId, tripIds))
      .groupBy(days.tripId),
  ]);

  const dayTotalsByTrip = dayCountAggs.reduce<Record<string, number>>((acc, dayCountAgg) => {
    acc[dayCountAgg.tripId] = dayCountAgg.dayTotal;
    return acc;
  }, {});

  return {
    trips: tripList.map((trip) => {
      const tripEntry = dbTripToType(trip);
      return { ...tripEntry, dayTotal: dayTotalsByTrip[trip.id] ?? tripEntry.dayTotal };
    }),
    expenses: expenseRows.map(dbExpenseToType),
  };
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

  const tripNotesPromise = db.select().from(notes).where(eq(notes.tripId, tripId)).orderBy(notes.position);
  const tripReservationsPromise = db.select().from(reservations).where(eq(reservations.tripId, tripId));
  const tripExpensesPromise = db.select().from(expenses).where(eq(expenses.tripId, tripId));
  const [tripNotes, tripReservations, tripExpenses] = await Promise.all([
    tripNotesPromise,
    tripReservationsPromise,
    tripExpensesPromise,
  ]);

  const reservationIds = tripReservations.map((row) => row.id);
  const reservationDocRows =
    reservationIds.length > 0
      ? await db
          .select()
          .from(documents)
          .where(inArray(documents.reservationId, reservationIds))
          .orderBy(sql`${documents.addedAt} desc nulls last`, asc(documents.id))
      : [];
  const docsByReservationId = new Map<string, (typeof documents.$inferSelect)[]>();
  for (const docRow of reservationDocRows) {
    if (!docRow.reservationId) continue;
    const existing = docsByReservationId.get(docRow.reservationId) ?? [];
    existing.push(docRow);
    docsByReservationId.set(docRow.reservationId, existing);
  }

  const expensesByEventId = new Map<string, typeof expenses.$inferSelect>();
  const expensesByReservationId = new Map<string, typeof expenses.$inferSelect>();
  for (const expenseRow of tripExpenses) {
    if (expenseRow.eventId) {
      expensesByEventId.set(expenseRow.eventId, expenseRow);
    }
    if (expenseRow.reservationId) {
      expensesByReservationId.set(expenseRow.reservationId, expenseRow);
    }
  }

  const reservationsDomain = tripReservations.map((row) => ({
    ...dbReservationToType(row),
    expense: expensesByReservationId.get(row.id) ? dbExpenseToType(expensesByReservationId.get(row.id)!) : undefined,
    documents: (docsByReservationId.get(row.id) ?? []).map(dbDocToType),
  }));
  const linkedEvents = deriveLinkedEvents(reservationsDomain);

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
      events: [
        ...linkedEvents.filter(
          (linkedEvent) => !!day.date && !!linkedEvent.startAt && toLocalDateKey(linkedEvent.startAt) === day.date
        ),
        ...(eventsByDay.get(day.id) ?? []).map((event) => ({
          ...dbEventToType(event),
          expense: expensesByEventId.get(event.id) ? dbExpenseToType(expensesByEventId.get(event.id)!) : undefined,
          docs: (docsByEventId.get(event.id) ?? []).map(dbDocToType),
        })),
      ].sort((first, second) => first.position - second.position),
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
      expense: expensesByEventId.get(event.id) ? dbExpenseToType(expensesByEventId.get(event.id)!) : undefined,
      docs: (docsByEventId.get(event.id) ?? []).map(dbDocToType),
    })),
    docs: tripDocs.map(dbDocToType),
    collaborators: tripCollaborators.map(dbCollabToType),
    packingItems: tripPackingItems.map(dbPackingItemToType),
    packingLists: tripPackingListRows.map(dbPackingListToType),
    reservations: reservationsDomain,
    expenses: tripExpenses.map(dbExpenseToType),
    notes: tripNotes.map(dbTripNoteToType),
  };
}
