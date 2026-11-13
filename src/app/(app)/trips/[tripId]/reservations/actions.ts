"use server";

import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { db } from "@/db";
import { reservations, documents, trips } from "@/db/schema";
import { revalidatePath } from "next/cache";
import type { CollaboratorRole, ReservationType, CreateReservationInput, UpdateReservationPatch } from "@/data/types";
import { createReservationSchema, parseInput, updateReservationSchema } from "@/lib/validation-schemas";
import { lockTripForUpdate, TRIP_NOT_FOUND_MESSAGE, type DbTransaction } from "@/lib/server-action-locks";
import { resolveDocumentTripId } from "@/lib/document-ancestry";
import { queueFileDeletions, removeQueuedFiles, type QueuedFileDeletion } from "@/lib/file-cleanup";
import { requireTripRole, TripForbiddenError, TripNotFoundError } from "@/lib/services/trip-access";
import { REQUIRES_END_AT } from "@/components/arrivo/reservation-type-badge";
import { recordTripUpdated } from "@/lib/trip-activity";
import { extendTripDateRange } from "./reservation-date-range";

export async function createReservation(tripId: string, rawInput: CreateReservationInput): Promise<void> {
  const user = await requireUser();
  const input = parseInput(createReservationSchema, rawInput);
  await assertTripAccess(tripId, user.id!, "editor");

  if (REQUIRES_END_AT.includes(input.type) && !input.endAt) {
    throw new Error("An end date and time is required for this reservation type.");
  }

  await db.transaction(async (transaction) => {
    await lockTripForUpdate(transaction, tripId);

    const [currentTrip] = await transaction
      .select({ startDate: trips.startDate, endDate: trips.endDate })
      .from(trips)
      .where(eq(trips.id, tripId));
    if (!currentTrip) {
      throw new Error("Trip not found.");
    }
    if (!currentTrip.startDate) {
      throw new Error("Set trip dates before adding a reservation.");
    }

    await extendTripDateRange(
      transaction,
      tripId,
      currentTrip.startDate,
      currentTrip.endDate ?? undefined,
      input.startAt,
      input.endAt
    );

    await transaction.insert(reservations).values({
      tripId,
      type: input.type,
      provider: input.provider.trim(),
      startAt: input.startAt ? new Date(input.startAt) : undefined,
      endAt: input.endAt ? new Date(input.endAt) : undefined,
      startAddress: input.startAddress,
      startLocationName: input.startLocationName,
      startLocationLat: input.startLocationLat,
      startLocationLng: input.startLocationLng,
      endAddress: input.endAddress,
      endLocationName: input.endLocationName,
      endLocationLat: input.endLocationLat,
      endLocationLng: input.endLocationLng,
      confirmationCode: input.confirmationCode,
      serviceNumber: input.serviceNumber,
      notes: input.notes,
    });
  });

  recordTripUpdated(user.id!, tripId);
  revalidatePath(`/trips/${tripId}`);
}

export async function updateReservation(reservationId: string, rawPatch: UpdateReservationPatch): Promise<void> {
  const user = await requireUser();
  const patch = parseInput(updateReservationSchema, rawPatch);

  const [existingReservation] = await db
    .select({ tripId: reservations.tripId })
    .from(reservations)
    .where(eq(reservations.id, reservationId));
  if (!existingReservation) {
    throw new Error("Reservation not found.");
  }

  await assertTripAccess(existingReservation.tripId, user.id!, "editor");

  await db.transaction(async (transaction) => {
    await lockTripForUpdate(transaction, existingReservation.tripId);

    const [existing] = await transaction.select().from(reservations).where(eq(reservations.id, reservationId));
    if (!existing) {
      throw new Error("Reservation not found.");
    }

    const type = existing.type as ReservationType;
    const nextStartAt = patch.startAt !== undefined ? patch.startAt || undefined : existing.startAt?.toISOString();
    const nextEndAt = patch.endAt !== undefined ? patch.endAt || undefined : existing.endAt?.toISOString();
    const existingStartDate = existing.startAt?.toISOString().slice(0, 10);
    const existingEndDate = existing.endAt?.toISOString().slice(0, 10);
    const nextStartDate = nextStartAt?.slice(0, 10);
    const nextEndDate = nextEndAt?.slice(0, 10);
    const reservationDateChanged =
      (patch.startAt !== undefined && nextStartDate !== existingStartDate) ||
      (patch.endAt !== undefined && nextEndDate !== existingEndDate);

    if (REQUIRES_END_AT.includes(type) && !nextEndAt) {
      throw new Error("An end date and time is required for this reservation type.");
    }

    if (nextEndAt && !nextStartAt) {
      throw new Error("A start date and time is required when an end date and time is set.");
    }

    if (nextStartAt && nextEndAt && new Date(nextEndAt).getTime() < new Date(nextStartAt).getTime()) {
      throw new Error("The end date and time must be after the start date and time.");
    }

    const [trip] = await transaction
      .select({ startDate: trips.startDate, endDate: trips.endDate })
      .from(trips)
      .where(eq(trips.id, existing.tripId));

    if (reservationDateChanged) {
      await extendTripDateRange(
        transaction,
        existing.tripId,
        trip.startDate ?? undefined,
        trip.endDate ?? undefined,
        nextStartAt,
        nextEndAt
      );
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.provider !== undefined) updates.provider = patch.provider.trim();
    if (patch.startAt !== undefined) updates.startAt = patch.startAt ? new Date(patch.startAt) : null;
    if (patch.endAt !== undefined) updates.endAt = patch.endAt ? new Date(patch.endAt) : null;
    if (patch.startAddress !== undefined) {
      updates.startAddress = patch.startAddress || null;
      if (!patch.startAddress) {
        updates.startLocationName = null;
        updates.startLocationLat = null;
        updates.startLocationLng = null;
      } else {
        if (patch.startLocationName !== undefined) updates.startLocationName = patch.startLocationName || null;
        if (patch.startLocationLat !== undefined) updates.startLocationLat = patch.startLocationLat;
        if (patch.startLocationLng !== undefined) updates.startLocationLng = patch.startLocationLng;
      }
    }
    if (patch.endAddress !== undefined) {
      updates.endAddress = patch.endAddress || null;
      if (!patch.endAddress) {
        updates.endLocationName = null;
        updates.endLocationLat = null;
        updates.endLocationLng = null;
      } else {
        if (patch.endLocationName !== undefined) updates.endLocationName = patch.endLocationName || null;
        if (patch.endLocationLat !== undefined) updates.endLocationLat = patch.endLocationLat;
        if (patch.endLocationLng !== undefined) updates.endLocationLng = patch.endLocationLng;
      }
    }
    if (patch.confirmationCode !== undefined) updates.confirmationCode = patch.confirmationCode || null;
    if (patch.serviceNumber !== undefined) updates.serviceNumber = patch.serviceNumber || null;
    if (patch.notes !== undefined) updates.notes = patch.notes || null;

    await transaction.update(reservations).set(updates).where(eq(reservations.id, reservationId));
  });

  recordTripUpdated(user.id!, existingReservation.tripId);
  revalidatePath(`/trips/${existingReservation.tripId}`);
}

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
