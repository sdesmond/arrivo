import "server-only";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ActivityEventType, type ActivityIdentity, type InvitationActivityEventType } from "@/data/types";
import { recordActivity } from "@/lib/activity";
import { withTimeout } from "@/lib/with-timeout";

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
  recordWithActorLookup(ActivityEventType.TripUpdated, userId, tripId);
}

/** Individual invitation transitions use the same bounded, best-effort actor lookup. */
export function recordTripInvitation(type: InvitationActivityEventType, userId: string, tripId: string): void {
  recordWithActorLookup(type, userId, tripId);
}

function recordWithActorLookup(
  type: typeof ActivityEventType.TripUpdated | InvitationActivityEventType,
  userId: string,
  tripId: string
): void {
  try {
    after(async () => {
      try {
        const [actor] = await withTimeout(
          db.select({ username: users.username }).from(users).where(eq(users.id, userId)),
          TRIP_ACTIVITY_LOOKUP_TIMEOUT_MS,
          "Activity identity lookup timed out"
        );
        if (!actor) return;
        recordActivity({
          type,
          actor: { id: userId, username: actor.username },
          tripId,
        });
      } catch {
        // Lookup and recording failures are deliberately invisible to the trip mutation.
      }
    });
  } catch {
    // Scheduling failures must leave the committed mutation and its response unchanged.
  }
}
