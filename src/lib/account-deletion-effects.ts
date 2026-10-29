import { LiveSyncEventType } from "@/data/types";
import type { ActivityEventInput, DeletedAccountSummary } from "@/data/types";
import { recordActivity } from "@/lib/activity";
import { publishInvitationChanged } from "@/lib/invitations";
import { getStorageAdapter } from "@/lib/storage/storage-adapter";
import { publishTripEvent, publishUserEvent, purgeTripTopic } from "@/lib/trip-events";

// Each effect is attempted on its own: the deletion has committed, so none may undo it or stop the rest.
async function attempt(label: string, effect: () => unknown): Promise<void> {
  try {
    await effect();
  } catch (error) {
    console.warn(`Account deletion effect failed: ${label}`, error);
  }
}

/**
 * Everything that follows a committed account deletion, shared by self-service and admin deletion: the Activity
 * event, live-sync notifications and file cleanup. Sign-out and revalidation stay with the caller.
 */
export async function runAccountDeletionEffects(
  deletion: DeletedAccountSummary,
  activity: ActivityEventInput
): Promise<void> {
  // First, since cleanup can be slow or interrupted.
  await attempt("activity", () => recordActivity(activity));

  await attempt("invitation notifications", () => {
    for (const invitation of deletion.rescindedInvitations) {
      publishInvitationChanged(invitation.inviteeId, invitation.tripId);
    }
  });
  await attempt("trip notifications", () => {
    for (const tripId of deletion.deletedTripIds) {
      publishTripEvent(tripId, { type: LiveSyncEventType.TripDeleted, tripId });
    }
    for (const tripId of new Set(deletion.remainingTripIds)) {
      publishTripEvent(tripId, { type: LiveSyncEventType.MembershipChanged, tripId });
    }
  });
  // Members watching their dashboard only hold their personal channel, mirroring deleteTrip; so does a new owner.
  await attempt("member notifications", () => {
    for (const member of deletion.deletedTripMembers) {
      publishUserEvent(member.userId, { type: LiveSyncEventType.TripDeleted, tripId: member.tripId });
    }
    for (const [tripId, heirUserId] of deletion.transferredTrips) {
      publishUserEvent(heirUserId, { type: LiveSyncEventType.MembershipChanged, tripId });
    }
  });
  await attempt("topic purge", () => {
    for (const tripId of deletion.deletedTripIds) purgeTripTopic(tripId);
  });

  // A file that won't delete must not stop the others.
  await Promise.all(
    deletion.storageUrls.map((url) => attempt(`cleanup of ${url}`, () => getStorageAdapter().del(url)))
  );
}
