import { eq } from "drizzle-orm";
import { db } from "@/db";
import { events, reservations } from "@/db/schema";
import { parseUploadStorageName } from "@/lib/upload-policy";

export async function resolveOwningTripId(key: string): Promise<string> {
  const { scope, ownerId } = parseUploadStorageName(key);

  switch (scope) {
    case "trip-document":
    case "trip-cover":
      return ownerId;
    case "event-document": {
      const [event] = await db.select({ tripId: events.tripId }).from(events).where(eq(events.id, ownerId));
      if (!event) throw new Error("Event not found");
      return event.tripId;
    }
    case "reservation-document": {
      const [reservation] = await db
        .select({ tripId: reservations.tripId })
        .from(reservations)
        .where(eq(reservations.id, ownerId));
      if (!reservation) throw new Error("Reservation not found.");
      return reservation.tripId;
    }
  }
}
