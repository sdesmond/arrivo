"use server";

import { eq } from "drizzle-orm";
import { put, del } from "@vercel/blob";
import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { db } from "@/db";
import { reservations, documents } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { inferDocKind, formatFileSize } from "@/lib/utils";
import { saveLocalUpload } from "@/lib/local-upload";
import { assertValidDocumentUpload, createUploadStorageName } from "@/lib/upload-policy";

async function getReservationTripId(reservationId: string): Promise<string> {
  const [reservation] = await db
    .select({ tripId: reservations.tripId })
    .from(reservations)
    .where(eq(reservations.id, reservationId));
  if (!reservation) throw new Error("Reservation not found.");
  return reservation.tripId;
}

export async function uploadReservationDocument(reservationId: string, formData: FormData, id?: string): Promise<void> {
  const user = await requireUser();
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
  if (!reservation) throw new Error("Reservation not found.");
  await assertTripAccess(reservation.tripId, user.id!, "editor");

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided.");
  assertValidDocumentUpload(file);

  const kind = inferDocKind(file.type);
  const isStub = process.env.UPLOAD_STUB === "true";
  const storageName = createUploadStorageName("reservation-document", reservationId, file.type);
  const url = isStub
    ? await saveLocalUpload(file, { storageName })
    : (await put(storageName, file, { access: "public" })).url;

  try {
    await db.insert(documents).values({
      ...(id ? { id } : {}),
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
