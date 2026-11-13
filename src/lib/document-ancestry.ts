import "server-only";
import { eq } from "drizzle-orm";
import { documents, events, reservations } from "@/db/schema";
import type { DbTransaction } from "@/lib/server-action-locks";

/** Anything that can run a read: the client or a transaction. */
type ReadExecutor = Pick<DbTransaction, "select">;

/** The trip an event belongs to, or undefined when the event is gone. */
export async function readEventTripId(executor: ReadExecutor, eventId: string): Promise<string | undefined> {
  const [row] = await executor.select({ tripId: events.tripId }).from(events).where(eq(events.id, eventId));
  return row?.tripId;
}

/** The trip a reservation belongs to, or undefined when the reservation is gone. */
export async function readReservationTripId(
  executor: ReadExecutor,
  reservationId: string
): Promise<string | undefined> {
  const [row] = await executor
    .select({ tripId: reservations.tripId })
    .from(reservations)
    .where(eq(reservations.id, reservationId));
  return row?.tripId;
}

/**
 * The one trip a document belongs to, or undefined when its ancestry cannot be trusted. Every populated link (its own
 * trip, event and reservation) must name the same trip. A missing parent, a link into another trip or no link at all
 * is unresolved, so a corrupt legacy row can never authorize a write through the wrong trip.
 */
export async function resolveDocumentTripId(
  executor: ReadExecutor,
  row: Pick<typeof documents.$inferSelect, "tripId" | "eventId" | "reservationId">
): Promise<string | undefined> {
  const tripIds = new Set<string>();
  if (row.tripId) tripIds.add(row.tripId);
  if (row.eventId) {
    const eventTripId = await readEventTripId(executor, row.eventId);
    if (!eventTripId) return undefined;
    tripIds.add(eventTripId);
  }
  if (row.reservationId) {
    const reservationTripId = await readReservationTripId(executor, row.reservationId);
    if (!reservationTripId) return undefined;
    tripIds.add(reservationTripId);
  }
  return tripIds.size === 1 ? [...tripIds][0] : undefined;
}
