"use server";

import { eq } from "drizzle-orm";
import { put, del } from "@vercel/blob";
import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { db } from "@/db";
import { reservations, documents } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { MAX_UPLOAD_BYTES, inferDocKind, formatFileSize } from "@/lib/utils";
import { saveLocalUpload } from "@/lib/local-upload";
import { ReservationType, type CreateReservationInput, type UpdateReservationPatch } from "@/data/types";

const REQUIRES_END_AT: ReservationType[] = [ReservationType.Lodging, ReservationType.RentalCar, ReservationType.Cruise];

async function getReservationTripId(reservationId: string): Promise<string> {
  const [reservation] = await db
    .select({ tripId: reservations.tripId })
    .from(reservations)
    .where(eq(reservations.id, reservationId));
  if (!reservation) throw new Error("Reservation not found.");
  return reservation.tripId;
}

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
    serviceNumber: input.serviceNumber,
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

export async function uploadReservationDocument(reservationId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
  if (!reservation) throw new Error("Reservation not found.");
  await assertTripAccess(reservation.tripId, user.id!, "editor");

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`File is too large. Max ${formatFileSize(MAX_UPLOAD_BYTES)}.`);

  const kind = inferDocKind(file.type);
  const isStub = process.env.UPLOAD_STUB === "true";
  const url = isStub ? await saveLocalUpload(file) : (await put(file.name, file, { access: "public" })).url;

  try {
    await db.insert(documents).values({
      tripId: reservation.tripId,
      reservationId,
      name: file.name,
      kind,
      size: formatFileSize(file.size),
      url,
    });
  } catch (error) {
    // Roll back the just-uploaded blob so a failed insert does not leak storage.
    if (!isStub) {
      try {
        await del(url);
      } catch {
        // Swallow rollback failure; surface the original insert error below.
      }
    }
    throw error;
  }

  revalidatePath(`/trips/${reservation.tripId}`);
}

export async function removeReservationDocument(docId: string): Promise<void> {
  const user = await requireUser();
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
  if (!doc) return;
  if (!doc.reservationId) throw new Error("Document is not attached to a reservation.");

  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, doc.reservationId));
  if (!reservation) throw new Error("Reservation not found.");

  await assertTripAccess(reservation.tripId, user.id!, "editor");

  if (doc.url && process.env.UPLOAD_STUB !== "true") {
    // Best-effort cleanup: a transient blob-store error must not block the DB delete.
    try {
      await del(doc.url);
    } catch {
      // Orphaned blob is tolerable; a blocked document delete is not.
    }
  }

  await db.delete(documents).where(eq(documents.id, docId));
  revalidatePath(`/trips/${reservation.tripId}`);
}

export async function renameReservationDocument(docId: string, newName: string): Promise<void> {
  const user = await requireUser();
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
  if (!doc) return;
  const tripId = doc.tripId ?? (doc.reservationId ? await getReservationTripId(doc.reservationId) : null);
  if (!tripId) return;
  await assertTripAccess(tripId, user.id!, "editor");
  await db.update(documents).set({ name: newName }).where(eq(documents.id, docId));
  revalidatePath(`/trips/${tripId}`);
}

export async function promoteReservationDocToTrip(docId: string): Promise<void> {
  const user = await requireUser();
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
  if (!doc) return;
  const tripId = doc.tripId ?? (doc.reservationId ? await getReservationTripId(doc.reservationId) : null);
  if (!tripId) return;
  await assertTripAccess(tripId, user.id!, "editor");
  await db.update(documents).set({ tripId, reservationId: null }).where(eq(documents.id, docId));
  revalidatePath(`/trips/${tripId}`);
}

export async function attachTripDocToReservation(docId: string, reservationId: string): Promise<void> {
  const user = await requireUser();
  const tripId = await getReservationTripId(reservationId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.update(documents).set({ reservationId }).where(eq(documents.id, docId));
  revalidatePath(`/trips/${tripId}`);
}
