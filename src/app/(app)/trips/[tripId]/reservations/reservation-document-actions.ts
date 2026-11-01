"use server";

import { eq } from "drizzle-orm";
import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { db } from "@/db";
import { reservations, documents } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { inferDocKind, formatFileSize } from "@/lib/utils";
import { getStorageAdapter } from "@/lib/storage/storage-adapter";
import { resolveOwningTripId } from "@/lib/storage/trip-resolution";
import { recordTripUpdated } from "@/lib/trip-activity";
import { assertValidDocumentUpload, createUploadStorageName } from "@/lib/upload-policy";

async function getReservationTripId(reservationId: string): Promise<string> {
  const [reservation] = await db
    .select({ tripId: reservations.tripId })
    .from(reservations)
    .where(eq(reservations.id, reservationId));
  if (!reservation) throw new Error("Reservation not found.");
  return reservation.tripId;
}

export async function uploadReservationDocument(reservationId: string, formData: FormData): Promise<void> {
  const user = await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided.");
  assertValidDocumentUpload(file);

  const kind = inferDocKind(file.type);
  const storageName = createUploadStorageName("reservation-document", reservationId, file.type);
  const tripId = await resolveOwningTripId(storageName);
  await assertTripAccess(tripId, user.id!, "editor");

  const url = await getStorageAdapter().put(storageName, file);

  try {
    await db.insert(documents).values({
      tripId,
      reservationId,
      name: file.name,
      kind,
      size: formatFileSize(file.size),
      url,
    });
  } catch (error) {
    // Roll back the just-uploaded file so a failed insert does not leak storage.
    // A rollback failure must never mask the original insert error.
    await getStorageAdapter()
      .del(url)
      .catch(() => {});
    throw error;
  }

  recordTripUpdated(user.id!, tripId);
  revalidatePath(`/trips/${tripId}`);
}

export async function removeReservationDocument(docId: string): Promise<void> {
  const user = await requireUser();
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
  if (!doc) return;
  if (!doc.reservationId) throw new Error("Document is not attached to a reservation.");

  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, doc.reservationId));
  if (!reservation) throw new Error("Reservation not found.");

  await assertTripAccess(reservation.tripId, user.id!, "editor");

  if (doc.url) {
    // Best-effort cleanup: a rejecting del (or an adapter that never throws)
    // must not block the DB delete.
    try {
      await getStorageAdapter().del(doc.url);
    } catch (error) {
      console.warn(`Cleanup failed for ${doc.url}`, error);
    }
  }

  await db.delete(documents).where(eq(documents.id, docId));
  recordTripUpdated(user.id!, reservation.tripId);
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
  recordTripUpdated(user.id!, tripId);
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
  recordTripUpdated(user.id!, tripId);
  revalidatePath(`/trips/${tripId}`);
}

export async function attachTripDocToReservation(docId: string, reservationId: string): Promise<void> {
  const user = await requireUser();
  const tripId = await getReservationTripId(reservationId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.update(documents).set({ reservationId }).where(eq(documents.id, docId));
  recordTripUpdated(user.id!, tripId);
  revalidatePath(`/trips/${tripId}`);
}
