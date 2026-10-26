import "server-only";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ActivityEventType, type ActivityIdentity } from "@/data/types";
import { recordActivity } from "@/lib/activity";

export const TRIP_ACTIVITY_LOOKUP_TIMEOUT_MS = 5_000;

/** Record only the committed identity and trip ID; Activity must never change the primary outcome. */
export function recordTripCreated(identity: ActivityIdentity, tripId: string): void {
  try {
    recordActivity({ type: ActivityEventType.TripCreated, actor: identity, tripId });
  } catch {
    // Best-effort observability, including scheduling failures.
  }
}

/** Defer the bounded identity lookup until after the response, outside the mutation's transaction. */
export function recordTripUpdated(userId: string, tripId: string): void {
  try {
    after(async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error("Activity identity lookup timed out")),
            TRIP_ACTIVITY_LOOKUP_TIMEOUT_MS
          );
        });
        const lookup = Promise.resolve(db.select({ username: users.username }).from(users).where(eq(users.id, userId)));
        // A timed-out query may still reject later; it must never escape or emit a late event.
        lookup.catch(() => undefined);
        const [actor] = await Promise.race([lookup, timeout]);
        if (!actor) return;
        recordActivity({
          type: ActivityEventType.TripUpdated,
          actor: { id: userId, username: actor.username },
          tripId,
        });
      } catch {
        // Lookup and recording failures are deliberately invisible to the trip mutation.
      } finally {
        clearTimeout(timer);
      }
    });
  } catch {
    // Scheduling failures must leave the committed mutation and its response unchanged.
  }
}
