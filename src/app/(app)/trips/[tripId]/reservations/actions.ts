"use server";

import { eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { db } from "@/db";
import { reservations, documents, trips } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { ReservationType, type CreateReservationInput, type UpdateReservationPatch } from "@/data/types";
import { lockTripForUpdate } from "@/lib/server-action-locks";
import { REQUIRES_END_AT } from "@/components/packt/reservation-type-badge";
import { extendTripDateRange } from "./reservation-date-range";

export async function createReservation(tripId: string, input: CreateReservationInput): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  if (!Object.values(ReservationType).includes(input.type)) {
    throw new Error("Invalid reservation type.");
  }

  if (!input.provider.trim()) {
    throw new Error("Provider is required.");
  }

  if (input.startAt !== undefined && Number.isNaN(new Date(input.startAt).getTime())) {
    throw new Error("Invalid start time.");
  }

  if (input.endAt !== undefined && Number.isNaN(new Date(input.endAt).getTime())) {
    throw new Error("Invalid end time.");
  }

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
      ...(input.id ? { id: input.id } : {}),
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
      cost: input.cost != null ? String(input.cost) : undefined,
      confirmationCode: input.confirmationCode,
      serviceNumber: input.serviceNumber,
      notes: input.notes,
    });
  });

  revalidatePath(`/trips/${tripId}`);
}

export async function updateReservation(reservationId: string, patch: UpdateReservationPatch): Promise<void> {
  const user = await requireUser();

  const [existingReservation] = await db
    .select({ tripId: reservations.tripId })
    .from(reservations)
    .where(eq(reservations.id, reservationId));
  if (!existingReservation) {
    throw new Error("Reservation not found.");
  }

  await assertTripAccess(existingReservation.tripId, user.id!, "editor");

  if (patch.provider !== undefined && !patch.provider.trim()) {
    throw new Error("Provider is required.");
  }

  if (patch.startAt && Number.isNaN(new Date(patch.startAt).getTime())) {
    throw new Error("Invalid start date and time.");
  }

  if (patch.endAt && Number.isNaN(new Date(patch.endAt).getTime())) {
    throw new Error("Invalid end date and time.");
  }

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
    if (patch.cost !== undefined) updates.cost = patch.cost != null ? String(patch.cost) : null;
    if (patch.confirmationCode !== undefined) updates.confirmationCode = patch.confirmationCode || null;
    if (patch.serviceNumber !== undefined) updates.serviceNumber = patch.serviceNumber || null;
    if (patch.notes !== undefined) updates.notes = patch.notes || null;

    await transaction.update(reservations).set(updates).where(eq(reservations.id, reservationId));
  });

  revalidatePath(`/trips/${existingReservation.tripId}`);
}

export async function deleteReservation(reservationId: string): Promise<void> {
  const user = await requireUser();

  const [existing] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
  if (!existing) {
    // Already deleted — treat as success (idempotent; guards against collaborator-race double-fire).
    return;
  }

  await assertTripAccess(existing.tripId, user.id!, "editor");

  const attachedDocs = await db.select().from(documents).where(eq(documents.reservationId, reservationId));
  const blobUrls = attachedDocs.map((doc) => doc.url).filter(Boolean) as string[];
  if (blobUrls.length > 0 && process.env.UPLOAD_STUB !== "true") {
    // Best-effort cleanup: a transient blob-store error must not block the DB delete.
    try {
      await del(blobUrls);
    } catch {
      // Orphaned blobs are tolerable; a blocked reservation delete is not.
    }
  }

  await db.delete(reservations).where(eq(reservations.id, reservationId));

  revalidatePath(`/trips/${existing.tripId}`);
}
