"use server";

import { and, eq } from "drizzle-orm";
import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { db } from "@/db";
import { reservations, documents } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { getStorageAdapter } from "@/lib/storage/storage-adapter";
import { recordTripUpdated } from "@/lib/trip-activity";

async function getReservationTripId(reservationId: string): Promise<string> {
  const [reservation] = await db
    .select({ tripId: reservations.tripId })
    .from(reservations)
    .where(eq(reservations.id, reservationId));
  if (!reservation) throw new Error("Reservation not found.");
  return reservation.tripId;
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
  // Scope the doc to the reservation's trip: an editor on one trip must not re-point another trip's document.
  const attached = await db
    .update(documents)
    .set({ reservationId })
    .where(and(eq(documents.id, docId), eq(documents.tripId, tripId)))
    .returning({ id: documents.id });
  if (attached.length === 0) throw new Error("Document not found.");
  recordTripUpdated(user.id!, tripId);
  revalidatePath(`/trips/${tripId}`);
}
