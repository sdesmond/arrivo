import { eq, inArray, or } from "drizzle-orm";
import {
  checklistItems,
  days,
  documents,
  events,
  expenses,
  itineraryChecklists,
  itineraryNotes,
  notes,
  packingItems,
  reservations,
  tripPackingLists,
} from "@/db/schema";
import type { DbTransaction } from "@/lib/server-action-locks";
import { recordDeletions, type DeletionRecordResource } from "./deletion-records";

// No `server-only` marker: account-deletion.ts reaches this module and the E2E steps load that file in plain Node.
type TripCascadeResource = Exclude<DeletionRecordResource, "trip" | "packing-template" | "packing-template-item">;

/** What deleting a trip removes besides the trip row: the rows' ids per resource, and the documents' files. */
export interface TripCascade {
  removed: Record<TripCascadeResource, { id: string }[]>;
  files: { id: string; url: string | null }[];
}

/**
 * Finds, and locks, every row that goes with the trip. Call it before the trip row is deleted. Parents are locked
 * before their children are read: legacy associations can point across trips, so the trip lock alone cannot serialize
 * every writer and the cascade must follow each foreign key.
 */
export async function selectTripCascade(transaction: DbTransaction, tripId: string): Promise<TripCascade> {
  const tripDays = await transaction.select({ id: days.id }).from(days).where(eq(days.tripId, tripId)).for("update");
  const dayIds = transaction.select({ id: days.id }).from(days).where(eq(days.tripId, tripId));
  const eventScope = or(eq(events.tripId, tripId), inArray(events.dayId, dayIds));
  const tripEvents = await transaction.select({ id: events.id }).from(events).where(eventScope).for("update");
  const eventIds = transaction.select({ id: events.id }).from(events).where(eventScope);
  const tripReservations = await transaction
    .select({ id: reservations.id })
    .from(reservations)
    .where(eq(reservations.tripId, tripId))
    .for("update");
  const reservationIds = transaction
    .select({ id: reservations.id })
    .from(reservations)
    .where(eq(reservations.tripId, tripId));
  const tripChecklists = await transaction
    .select({ id: itineraryChecklists.id })
    .from(itineraryChecklists)
    .where(inArray(itineraryChecklists.dayId, dayIds))
    .for("update");
  const tripLists = await transaction
    .select({ id: tripPackingLists.id })
    .from(tripPackingLists)
    .where(eq(tripPackingLists.tripId, tripId))
    .for("update");
  const listIds = transaction
    .select({ id: tripPackingLists.id })
    .from(tripPackingLists)
    .where(eq(tripPackingLists.tripId, tripId));
  const checklistIds = transaction
    .select({ id: itineraryChecklists.id })
    .from(itineraryChecklists)
    .where(inArray(itineraryChecklists.dayId, dayIds));
  const files = await transaction
    .select({ id: documents.id, url: documents.url })
    .from(documents)
    .where(
      or(
        eq(documents.tripId, tripId),
        inArray(documents.eventId, eventIds),
        inArray(documents.reservationId, reservationIds)
      )
    )
    .for("update");
  const tripExpenses = await transaction
    .select({ id: expenses.id })
    .from(expenses)
    .where(
      or(
        eq(expenses.tripId, tripId),
        inArray(expenses.eventId, eventIds),
        inArray(expenses.reservationId, reservationIds)
      )
    )
    .for("update");
  const tripPackingItems = await transaction
    .select({ id: packingItems.id })
    .from(packingItems)
    .where(or(eq(packingItems.tripId, tripId), inArray(packingItems.listId, listIds)))
    .for("update");
  const tripChecklistItems = await transaction
    .select({ id: checklistItems.id })
    .from(checklistItems)
    .where(inArray(checklistItems.checklistId, checklistIds));
  const dayNotes = await transaction
    .select({ id: itineraryNotes.id })
    .from(itineraryNotes)
    .where(inArray(itineraryNotes.dayId, dayIds));
  const tripNotes = await transaction.select({ id: notes.id }).from(notes).where(eq(notes.tripId, tripId));

  return {
    files,
    removed: {
      day: tripDays,
      event: tripEvents,
      reservation: tripReservations,
      document: files,
      expense: tripExpenses,
      "itinerary-note": dayNotes,
      checklist: tripChecklists,
      "checklist-item": tripChecklistItems,
      "trip-note": tripNotes,
      "packing-list": tripLists,
      "packing-item": tripPackingItems,
    },
  };
}

/**
 * Remembers the deleted trip and everything {@link selectTripCascade} found, so a create retried with one of those
 * client ids conflicts instead of bringing the row back. Call it in the deleting transaction, after the trip delete.
 */
export async function recordTripCascade(
  transaction: DbTransaction,
  tripId: string,
  cascade: TripCascade,
  userId: string
): Promise<void> {
  await recordDeletions(transaction, "trip", [tripId], userId);
  for (const [resource, rows] of Object.entries(cascade.removed) as [TripCascadeResource, { id: string }[]][]) {
    await recordDeletions(
      transaction,
      resource,
      rows.map(({ id }) => id),
      userId
    );
  }
}
