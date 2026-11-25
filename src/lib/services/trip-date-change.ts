import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  checklistItems,
  days,
  documents,
  events,
  expenses,
  itineraryChecklists,
  itineraryNotes,
  reservations,
  trips,
} from "@/db/schema";
import type { ReservationType, TripDateChangeConfirmation, TripDateChangePreviewReservation } from "@/data/types";
import { TripDateConflictResolution } from "@/data/types";
import type { DbTransaction } from "@/lib/server-action-locks";
import { stableStringify, toLocalDateKey } from "@/lib/utils";
import { buildDayRows } from "@/app/(app)/trips/create-trip-days";
import {
  buildTripDateChangeConfirmation,
  buildTripDateSyncPlan,
  resolveTripDateRange,
} from "@/app/(app)/trips/date-sync";
import { ConfirmationRequiredError } from "./confirmation-required-error";
import { ConflictError } from "./conflict-error";
import { recordDeletions } from "./deletion-records";
import { ValidationFailedError } from "./validation-failed-error";

const DAY_NUMBER_TEMP_OFFSET = 1000;
const CONFIRMATION_MESSAGE = "This date change removes planned content. Confirm to continue.";
const STALE_MESSAGE = "Trip dates changed before this confirmation was applied. Review the date change again.";

export interface TripDateChangeInput {
  startDate?: string | null;
  endDate?: string | null;
  resolution?: TripDateConflictResolution;
  confirmation?: TripDateChangeConfirmation;
}

export interface TripDateChangeResult {
  startDate: string | null;
  endDate: string | null;
  /** Stored files whose rows this change deleted; the caller queues them in the same transaction. */
  documentUrls: string[];
}

interface RemovedDayContentSummary {
  confirmation: TripDateChangeConfirmation;
  events: { id: string; displacedDate?: string; position: number; dayId: string }[];
  eventDocumentUrls: string[];
  eventDocumentIds: string[];
  reservationIds: string[];
  reservationDocumentUrls: string[];
  reservationDocumentIds: string[];
  /** Day children that cascade with the removed days, recorded so a late create retry cannot recreate them. */
  noteIds: string[];
  checklistIds: string[];
  checklistItemIds: string[];
  requiresConfirmation: boolean;
}

async function summarizeRemovedDayContent(
  transaction: DbTransaction,
  tripId: string,
  removedDays: (typeof days.$inferSelect)[]
): Promise<RemovedDayContentSummary> {
  const removedDayIds = removedDays.map((day) => day.id);
  const removedDateByDayId = new Map(removedDays.map((day) => [day.id, day.date ?? undefined]));
  const removedDateOrder = new Map(removedDays.map((day, index) => [day.id, index]));

  const removedEvents =
    removedDayIds.length === 0
      ? []
      : await transaction
          .select({ id: events.id, name: events.name, dayId: events.dayId, position: events.position })
          .from(events)
          .where(inArray(events.dayId, removedDayIds));

  const eventIds = removedEvents.map((event) => event.id);
  const eventDocs =
    eventIds.length === 0
      ? []
      : await transaction
          .select({ id: documents.id, eventId: documents.eventId, url: documents.url })
          .from(documents)
          .where(inArray(documents.eventId, eventIds));

  const dayNotes =
    removedDayIds.length === 0
      ? []
      : await transaction
          .select({ id: itineraryNotes.id })
          .from(itineraryNotes)
          .where(inArray(itineraryNotes.dayId, removedDayIds));

  const dayChecklists =
    removedDayIds.length === 0
      ? []
      : await transaction
          .select({ id: itineraryChecklists.id })
          .from(itineraryChecklists)
          .where(inArray(itineraryChecklists.dayId, removedDayIds));
  const dayChecklistItems =
    dayChecklists.length === 0
      ? []
      : await transaction
          .select({ id: checklistItems.id })
          .from(checklistItems)
          .where(
            inArray(
              checklistItems.checklistId,
              dayChecklists.map((checklist) => checklist.id)
            )
          );

  const removedDateSet = new Set(removedDays.map((day) => day.date).filter((date): date is string => !!date));
  const tripReservations =
    removedDateSet.size === 0
      ? []
      : await transaction
          .select({
            id: reservations.id,
            provider: reservations.provider,
            type: reservations.type,
            startAt: reservations.startAt,
            endAt: reservations.endAt,
          })
          .from(reservations)
          .where(eq(reservations.tripId, tripId));
  const sortedRemovedDates = [...removedDateSet].sort();
  const affectedReservations: TripDateChangePreviewReservation[] = [];
  for (const reservation of tripReservations) {
    const dateKeys = [reservation.startAt, reservation.endAt]
      .filter((value): value is Date => !!value)
      .map((value) => toLocalDateKey(value.toISOString()))
      .sort();
    if (dateKeys.length === 0) continue;
    const firstKey = dateKeys[0];
    const lastKey = dateKeys[dateKeys.length - 1];
    // A reservation overlaps a removed day when that day sits anywhere in [start, end], not just on an endpoint.
    const affectedDate = sortedRemovedDates.find((date) => date >= firstKey && date <= lastKey);
    if (affectedDate) {
      affectedReservations.push({
        id: reservation.id,
        provider: reservation.provider,
        type: reservation.type as ReservationType,
        date: affectedDate,
      });
    }
  }
  const affectedReservationIds = affectedReservations.map((reservation) => reservation.id);
  const reservationDocs =
    affectedReservationIds.length === 0
      ? []
      : await transaction
          .select({ id: documents.id, eventId: documents.eventId, url: documents.url })
          .from(documents)
          .where(inArray(documents.reservationId, affectedReservationIds));
  affectedReservations.sort((first, second) => first.date.localeCompare(second.date));

  const docCountByEventId = new Map<string, number>();
  for (const eventDoc of eventDocs) {
    if (!eventDoc.eventId) continue;
    docCountByEventId.set(eventDoc.eventId, (docCountByEventId.get(eventDoc.eventId) ?? 0) + 1);
  }

  const previewEvents = removedEvents
    .filter((event) => !!event.dayId)
    .map((event) => ({
      id: event.id,
      name: event.name,
      displacedDate: event.dayId ? removedDateByDayId.get(event.dayId) : undefined,
      docCount: docCountByEventId.get(event.id) ?? 0,
    }))
    .sort((first, second) => {
      const firstOrder = removedDays.findIndex((day) => day.date === first.displacedDate);
      const secondOrder = removedDays.findIndex((day) => day.date === second.displacedDate);
      if (firstOrder !== secondOrder) return firstOrder - secondOrder;
      return first.name.localeCompare(second.name);
    });

  return {
    confirmation: buildTripDateChangeConfirmation(
      removedDays.map((day) => day.date!).filter(Boolean),
      removedDays.some((day) => !day.date) ? removedDays.map((day) => day.label) : undefined,
      previewEvents,
      dayNotes.length,
      dayChecklists.length,
      eventDocs.length,
      affectedReservations,
      reservationDocs.length
    ),
    events: removedEvents
      .filter((event): event is { id: string; name: string; dayId: string; position: number } => !!event.dayId)
      .map((event) => ({
        id: event.id,
        dayId: event.dayId,
        displacedDate: removedDateByDayId.get(event.dayId),
        position: event.position,
      }))
      .sort((first, second) => {
        const firstOrder = removedDateOrder.get(first.dayId) ?? 0;
        const secondOrder = removedDateOrder.get(second.dayId) ?? 0;
        if (firstOrder !== secondOrder) return firstOrder - secondOrder;
        return first.position - second.position;
      }),
    eventDocumentUrls: eventDocs.map((eventDoc) => eventDoc.url).filter((url): url is string => !!url),
    eventDocumentIds: eventDocs.map((eventDoc) => eventDoc.id),
    reservationIds: affectedReservationIds,
    reservationDocumentUrls: reservationDocs.map((doc) => doc.url).filter((url): url is string => !!url),
    reservationDocumentIds: reservationDocs.map((doc) => doc.id),
    noteIds: dayNotes.map((note) => note.id),
    checklistIds: dayChecklists.map((checklist) => checklist.id),
    checklistItemIds: dayChecklistItems.map((item) => item.id),
    requiresConfirmation:
      removedEvents.length > 0 || dayNotes.length > 0 || dayChecklists.length > 0 || affectedReservations.length > 0,
  };
}

function buildRows(tripId: string, startDate: string | undefined, endDate: string | undefined) {
  try {
    return buildDayRows(tripId, startDate, endDate);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid trip dates.";
    throw new ValidationFailedError(message, { endDate: [message] });
  }
}

/**
 * Moves a trip onto new dates inside the caller's locked transaction: dated/dateless transitions, day renumbering, and
 * conflict handling for days that go away. Removed days holding content throw `ConfirmationRequiredError` (carrying the
 * confirmation) until `resolution` arrives with a `confirmation` that still matches freshly read state; a mismatch is a
 * `ConflictError`. The caller writes the trip's own date columns from the result.
 */
export async function applyTripDateChange(
  transaction: DbTransaction,
  tripId: string,
  trip: Pick<typeof trips.$inferSelect, "startDate" | "endDate">,
  input: TripDateChangeInput,
  userId: string
): Promise<TripDateChangeResult> {
  const { resolution, confirmation: expectedConfirmation } = input;
  const existingDays = await transaction
    .select()
    .from(days)
    .where(eq(days.tripId, tripId))
    .orderBy(asc(days.dayNumber));
  if (existingDays.length === 0) throw new Error("Trip has no day rows — invariant violated.");

  const isCurrentlyDateless = existingDays.every((day) => !day.date);
  const isClearingDates = input.startDate === null;
  const desiredRange = resolveTripDateRange(
    { startDate: trip.startDate ?? undefined, endDate: trip.endDate ?? undefined },
    input
  );
  // buildDayRows swaps a reversed range; reject it so a PATCH cannot silently move the trip (create rejects it too).
  if (desiredRange.startDate && desiredRange.endDate && desiredRange.endDate < desiredRange.startDate) {
    const message = "End date must not be before the start date.";
    throw new ValidationFailedError(message, { endDate: [message] });
  }
  const desiredDayRows = buildRows(tripId, desiredRange.startDate, desiredRange.endDate);

  // ── dated → dateless: null out day dates, preserve rows ──────────────────
  if (!isCurrentlyDateless && isClearingDates) {
    await transaction
      .update(days)
      .set({ date: null })
      .where(
        inArray(
          days.id,
          existingDays.map((day) => day.id)
        )
      );
    return { startDate: null, endDate: null, documentUrls: [] };
  }

  // ── dateless → dateless: nothing to move ─────────────────────────────────
  if (isCurrentlyDateless && !desiredRange.startDate) {
    return { startDate: null, endDate: null, documentUrls: [] };
  }

  let mappedDays: (typeof days.$inferSelect)[] = [];
  let removedDays: (typeof days.$inferSelect)[];
  let survivingDays: (typeof days.$inferSelect)[] = [];
  let syncPlan: ReturnType<typeof buildTripDateSyncPlan> | undefined;
  let currentDayByDate = new Map<string, typeof days.$inferSelect>();
  if (isCurrentlyDateless) {
    // dateless → dated: map existing days onto the new dates; the rest overflow.
    mappedDays = existingDays.slice(0, desiredDayRows.length);
    removedDays = existingDays.slice(desiredDayRows.length);
  } else {
    if (existingDays.some((day) => !day.date)) {
      throw new ConflictError("Unable to update trip dates because one or more scheduled days are missing dates.");
    }
    syncPlan = buildTripDateSyncPlan(
      existingDays.map((day) => day.date!),
      desiredDayRows.map((day) => day.date!)
    );
    const desiredDateSet = new Set(syncPlan.desiredDates);
    currentDayByDate = new Map(existingDays.map((day) => [day.date!, day]));
    removedDays = existingDays.filter((day) => syncPlan!.removedDates.includes(day.date!));
    survivingDays = existingDays.filter((day) => desiredDateSet.has(day.date!));
  }

  const removedContent = await summarizeRemovedDayContent(transaction, tripId, removedDays);
  if (removedContent.requiresConfirmation && !resolution) {
    throw new ConfirmationRequiredError(CONFIRMATION_MESSAGE, removedContent.confirmation);
  }
  if (
    resolution &&
    expectedConfirmation &&
    stableStringify(removedContent.confirmation) !== stableStringify(expectedConfirmation)
  ) {
    throw new ConflictError(STALE_MESSAGE);
  }

  const documentUrls: string[] = [];
  if (resolution === TripDateConflictResolution.KeepAsUnscheduled) {
    for (const event of removedContent.events) {
      await transaction
        .update(events)
        .set({ dayId: null, displacedDate: event.displacedDate ?? null, updatedAt: new Date() })
        .where(eq(events.id, event.id));
    }
  }
  if (resolution === TripDateConflictResolution.DeleteEvents) {
    if (removedContent.events.length > 0) {
      const eventIds = removedContent.events.map((event) => event.id);
      documentUrls.push(...removedContent.eventDocumentUrls);
      const eventExpenses = await transaction
        .select({ id: expenses.id })
        .from(expenses)
        .where(inArray(expenses.eventId, eventIds));
      await recordDeletions(
        transaction,
        "expense",
        eventExpenses.map((expense) => expense.id),
        userId
      );
      await transaction.delete(events).where(inArray(events.id, eventIds));
      await recordDeletions(transaction, "event", eventIds, userId);
    }
    if (removedContent.reservationIds.length > 0) {
      documentUrls.push(...removedContent.reservationDocumentUrls);
      const linkedExpenses = await transaction
        .select({ id: expenses.id })
        .from(expenses)
        .where(inArray(expenses.reservationId, removedContent.reservationIds));
      await recordDeletions(transaction, "reservation", removedContent.reservationIds, userId);
      await recordDeletions(
        transaction,
        "expense",
        linkedExpenses.map((expense) => expense.id),
        userId
      );
      await transaction
        .delete(reservations)
        .where(and(eq(reservations.tripId, tripId), inArray(reservations.id, removedContent.reservationIds)));
    }
    await recordDeletions(
      transaction,
      "document",
      [...removedContent.eventDocumentIds, ...removedContent.reservationDocumentIds],
      userId
    );
  }
  if (removedDays.length > 0) {
    const removedIds = removedDays.map((day) => day.id);
    await transaction.delete(days).where(inArray(days.id, removedIds));
    await recordDeletions(transaction, "day", removedIds, userId);
    await recordDeletions(transaction, "itinerary-note", removedContent.noteIds, userId);
    await recordDeletions(transaction, "checklist", removedContent.checklistIds, userId);
    await recordDeletions(transaction, "checklist-item", removedContent.checklistItemIds, userId);
  }

  if (syncPlan) {
    for (const day of survivingDays) {
      await transaction
        .update(days)
        .set({ dayNumber: day.dayNumber + DAY_NUMBER_TEMP_OFFSET, label: `Temp Day ${day.dayNumber}` })
        .where(eq(days.id, day.id));
    }
    const addedDayRows = desiredDayRows.filter((day) => syncPlan.addedDates.includes(day.date!));
    if (addedDayRows.length > 0) await transaction.insert(days).values(addedDayRows);
    for (let index = 0; index < desiredDayRows.length; index++) {
      const desiredDay = desiredDayRows[index];
      const existingDay = currentDayByDate.get(desiredDay.date!);
      if (!existingDay || syncPlan.removedDates.includes(desiredDay.date!)) continue;
      await transaction
        .update(days)
        .set({ dayNumber: index + 1, label: `Day ${index + 1}` })
        .where(eq(days.id, existingDay.id));
    }
  } else {
    for (let index = 0; index < mappedDays.length; index++) {
      await transaction
        .update(days)
        .set({ dayNumber: index + 1, date: desiredDayRows[index].date, label: `Day ${index + 1}` })
        .where(eq(days.id, mappedDays[index].id));
    }
    const appendedDayRows = desiredDayRows.slice(mappedDays.length);
    if (appendedDayRows.length > 0) await transaction.insert(days).values(appendedDayRows);
  }

  return {
    startDate: desiredDayRows[0]?.date ?? null,
    endDate: desiredDayRows.at(-1)?.date ?? null,
    documentUrls,
  };
}
