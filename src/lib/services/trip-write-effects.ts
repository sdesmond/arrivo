import "server-only";
import type { Actor } from "@/data/types";
import { LiveSyncEventType } from "@/data/types";
import { recordTripUpdated } from "@/lib/trip-activity";
import { publishTripEvent } from "@/lib/trip-events";
import { revalidatePath } from "next/cache";
/** Call only after the owning transaction commits. `extraPaths` are further pages the write changes. */
export function afterTripWrite(actor: Actor, tripId: string, extraPaths: string[] = []): void {
  recordTripUpdated(actor.userId, tripId);
  publishTripEvent(tripId, { type: LiveSyncEventType.ItineraryChanged, tripId });
  revalidatePath(`/trips/${tripId}`);
  for (const path of extraPaths) revalidatePath(path);
}
