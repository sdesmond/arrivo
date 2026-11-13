"use server";

import { and, eq } from "drizzle-orm";
import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { db } from "@/db";
import { reservations, documents } from "@/db/schema";
import { revalidatePath } from "next/cache";

import { recordTripUpdated } from "@/lib/trip-activity";

async function getReservationTripId(reservationId: string): Promise<string> {
  const [reservation] = await db
    .select({ tripId: reservations.tripId })
    .from(reservations)
    .where(eq(reservations.id, reservationId));
  if (!reservation) throw new Error("Reservation not found.");
  return reservation.tripId;
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
