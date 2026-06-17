"use server";

import { eq } from "drizzle-orm";
import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { db } from "@/db";
import { reservations } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { ReservationType, type CreateReservationInput, type UpdateReservationPatch } from "@/data/types";

const REQUIRES_END_AT: ReservationType[] = [ReservationType.Lodging, ReservationType.RentalCar, ReservationType.Cruise];

export async function createReservation(tripId: string, input: CreateReservationInput): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  if (!Object.values(ReservationType).includes(input.type)) {
    throw new Error("Invalid reservation type.");
  }

  if (!input.provider.trim()) {
    throw new Error("Provider is required.");
  }

  if (REQUIRES_END_AT.includes(input.type) && !input.endAt) {
    throw new Error("An end date and time is required for this reservation type.");
  }

  await db.insert(reservations).values({
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
    notes: input.notes,
  });

  revalidatePath(`/trips/${tripId}`);
}

export async function updateReservation(reservationId: string, patch: UpdateReservationPatch): Promise<void> {
  const user = await requireUser();

  const [existing] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
  if (!existing) {
    throw new Error("Reservation not found.");
  }

  await assertTripAccess(existing.tripId, user.id!, "editor");

  if (patch.provider !== undefined && !patch.provider.trim()) {
    throw new Error("Provider is required.");
  }

  if (patch.startAt && Number.isNaN(new Date(patch.startAt).getTime())) {
    throw new Error("Invalid start date and time.");
  }

  if (patch.endAt && Number.isNaN(new Date(patch.endAt).getTime())) {
    throw new Error("Invalid end date and time.");
  }

  const type = existing.type as ReservationType;
  const nextStartAt = patch.startAt !== undefined ? patch.startAt || undefined : existing.startAt?.toISOString();
  const nextEndAt = patch.endAt !== undefined ? patch.endAt || undefined : existing.endAt?.toISOString();

  if (REQUIRES_END_AT.includes(type) && !nextEndAt) {
    throw new Error("An end date and time is required for this reservation type.");
  }

  if (nextEndAt && !nextStartAt) {
    throw new Error("A start date and time is required when an end date and time is set.");
  }

  if (nextStartAt && nextEndAt && new Date(nextEndAt).getTime() < new Date(nextStartAt).getTime()) {
    throw new Error("The end date and time must be after the start date and time.");
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.provider !== undefined) updates.provider = patch.provider.trim();
  if (patch.startAt !== undefined) updates.startAt = patch.startAt ? new Date(patch.startAt) : null;
  if (patch.endAt !== undefined) updates.endAt = patch.endAt ? new Date(patch.endAt) : null;
  if (patch.startAddress !== undefined) {
    updates.startAddress = patch.startAddress || null;
    updates.startLocationName = patch.startLocationName ?? null;
    updates.startLocationLat = patch.startLocationLat ?? null;
    updates.startLocationLng = patch.startLocationLng ?? null;
  }
  if (patch.endAddress !== undefined) {
    updates.endAddress = patch.endAddress || null;
    updates.endLocationName = patch.endLocationName ?? null;
    updates.endLocationLat = patch.endLocationLat ?? null;
    updates.endLocationLng = patch.endLocationLng ?? null;
  }
  if (patch.cost !== undefined) updates.cost = patch.cost != null ? String(patch.cost) : null;
  if (patch.confirmationCode !== undefined) updates.confirmationCode = patch.confirmationCode || null;
  if (patch.notes !== undefined) updates.notes = patch.notes || null;

  await db.update(reservations).set(updates).where(eq(reservations.id, reservationId));

  revalidatePath(`/trips/${existing.tripId}`);
}

export async function deleteReservation(reservationId: string): Promise<void> {
  const user = await requireUser();

  const [existing] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
  if (!existing) {
    // Already deleted — treat as success (idempotent; guards against collaborator-race double-fire).
    return;
  }

  await assertTripAccess(existing.tripId, user.id!, "editor");

  await db.delete(reservations).where(eq(reservations.id, reservationId));

  revalidatePath(`/trips/${existing.tripId}`);
}
