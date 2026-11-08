import "server-only";
import type { Actor } from "@/data/types";
import { LiveSyncEventType } from "@/data/types";
import { recordTripUpdated } from "@/lib/trip-activity";
import { publishTripEvent } from "@/lib/trip-events";
import { revalidatePath } from "next/cache";
/** Call only after the owning transaction commits. */
export function afterTripWrite(actor: Actor, tripId: string): void {
  recordTripUpdated(actor.userId, tripId);
  publishTripEvent(tripId, { type: LiveSyncEventType.ItineraryChanged, tripId });
  revalidatePath(`/trips/${tripId}`);
}
