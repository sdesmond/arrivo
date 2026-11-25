"use server";

import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { db } from "@/db";
import { reservations, documents } from "@/db/schema";
import { revalidatePath } from "next/cache";
import type { CollaboratorRole } from "@/data/types";
import { lockTripForUpdate, TRIP_NOT_FOUND_MESSAGE, type DbTransaction } from "@/lib/server-action-locks";
import { resolveDocumentTripId } from "@/lib/document-ancestry";
import { queueFileDeletions, removeQueuedFiles, type QueuedFileDeletion } from "@/lib/file-cleanup";
import { requireTripRole, TripForbiddenError, TripNotFoundError } from "@/lib/services/trip-access";
import { recordTripUpdated } from "@/lib/trip-activity";
import { recordDeletion } from "@/lib/services/deletion-records";

/** Rechecks the role inside the transaction; a lost or denied role is concealed as not found. */
async function assertLockedTripAccess(
  transaction: DbTransaction,
  tripId: string,
  userId: string,
  minRole: CollaboratorRole
): Promise<void> {
  try {
    await requireTripRole(tripId, userId, minRole, transaction);
  } catch (error) {
    if (error instanceof TripNotFoundError || error instanceof TripForbiddenError) notFound();
    throw error;
  }
}

/**
 * Deletes a reservation and the documents still attached to it. Everything is decided under the trip lock document
 * writes share: a document promoted before the lock no longer points here, so its file survives, and one promoted
 * after finds the reservation gone. The attached files are queued in the transaction and removed only after it commits.
 */
export async function deleteReservation(reservationId: string): Promise<void> {
  const user = await requireUser();

  const [existing] = await db
    .select({ tripId: reservations.tripId })
    .from(reservations)
    .where(eq(reservations.id, reservationId));
  if (!existing) {
    // Already deleted — treat as success (idempotent; guards against collaborator-race double-fire).
    return;
  }

  await assertTripAccess(existing.tripId, user.id!, "editor");

  let queued: QueuedFileDeletion[] = [];
  let deleted = false;
  await db.transaction(async (transaction) => {
    queued = [];
    deleted = false;
    try {
      await lockTripForUpdate(transaction, existing.tripId);
    } catch (error) {
      // The trip, and with it the reservation, is already gone.
      if (error instanceof Error && error.message === TRIP_NOT_FOUND_MESSAGE) return;
      throw error;
    }
    await assertLockedTripAccess(transaction, existing.tripId, user.id!, "editor");

    const [current] = await transaction
      .select({ id: reservations.id, tripId: reservations.tripId })
      .from(reservations)
      .where(eq(reservations.id, reservationId));
    if (!current) return;
    if (current.tripId !== existing.tripId) notFound();

    const attachedDocs = await transaction.select().from(documents).where(eq(documents.reservationId, reservationId));
    for (const attached of attachedDocs) {
      // The cascade below would delete this row, so it must belong to this trip through every link it holds.
      if ((await resolveDocumentTripId(transaction, attached)) !== existing.tripId) notFound();
    }
    queued = await queueFileDeletions(
      transaction,
      attachedDocs.map((attached) => attached.url).filter((url): url is string => !!url)
    );
    await transaction.delete(reservations).where(eq(reservations.id, reservationId));
    await recordDeletion(transaction, "reservation", reservationId, user.id!);
    deleted = true;
  });
  if (!deleted) return;

  recordTripUpdated(user.id!, existing.tripId);
  revalidatePath(`/trips/${existing.tripId}`);
  try {
    await removeQueuedFiles(queued);
  } catch (error) {
    // The rows are gone and the names are queued, so a failure only leaves the files for the next drain.
    console.warn("Could not remove deleted reservation files", error);
  }
}
