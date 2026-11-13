import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, events, reservations } from "@/db/schema";
import { resolveDocumentTripId } from "@/lib/document-ancestry";
import { parseUploadStorageName } from "@/lib/upload-policy";
import { StorageOwnerNotFoundError } from "./storage-adapter";

const STORAGE_PROXY_PREFIX = "/api/storage/";

export async function resolveOwningTripId(key: string): Promise<string> {
  const { scope, ownerId } = parseUploadStorageName(key);

  switch (scope) {
    case "trip-document":
    case "trip-cover":
      return ownerId;
    case "user-avatar":
      // Avatars belong to a user, not a trip; callers must branch on scope before resolving a trip.
      throw new Error("user-avatar keys have no owning trip");
    case "event-document": {
      const [event] = await db.select({ tripId: events.tripId }).from(events).where(eq(events.id, ownerId));
      if (event) return event.tripId;
      // Deleting an event while keeping its documents leaves files under the dead event's key; the document row
      // still names the trip, so the file stays readable by the trip's members.
      const [kept] = await db
        .select({ tripId: documents.tripId })
        .from(documents)
        .where(eq(documents.url, `${STORAGE_PROXY_PREFIX}${key}`));
      if (!kept?.tripId) throw new StorageOwnerNotFoundError("Event not found");
      return kept.tripId;
    }
    case "reservation-document": {
      const [reservation] = await db
        .select({ tripId: reservations.tripId })
        .from(reservations)
        .where(eq(reservations.id, ownerId));
      if (reservation) return reservation.tripId;
      // A promoted document keeps the file after its reservation is deleted. Only a single row holding this exact
      // URL, whose remaining links agree on one trip, may name the trip; the caller still checks membership.
      const survivors = await db
        .select()
        .from(documents)
        .where(eq(documents.url, `${STORAGE_PROXY_PREFIX}${key}`));
      const survivingTripId = survivors.length === 1 ? await resolveDocumentTripId(db, survivors[0]) : undefined;
      if (!survivingTripId) throw new StorageOwnerNotFoundError("Reservation not found.");
      return survivingTripId;
    }
  }
}
