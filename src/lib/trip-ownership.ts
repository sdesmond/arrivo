import { CollaboratorRole, TripDeletionAction } from "@/data/types";
import type { AccountDeletionTrip, TripDeletionChoice } from "@/data/types";

export interface OwnedTripMemberRow {
  id: string;
  tripId: string;
  userId: string | null;
  name: string;
  role: string;
  addedAt: Date | null;
}

const HEIR_ROLE_RANK: Record<string, number> = {
  [CollaboratorRole.Manager]: 2,
  [CollaboratorRole.Editor]: 1,
  [CollaboratorRole.Viewer]: 0,
};
const UNKNOWN_ROLE_RANK = -1;

function heirRoleRank(role: string): number {
  return HEIR_ROLE_RANK[role] ?? UNKNOWN_ROLE_RANK;
}

// Rows without an added time sort after every timed row; there's no better signal for them.
function addedAtValue(addedAt: Date | null): number {
  return addedAt ? addedAt.getTime() : Number.POSITIVE_INFINITY;
}

/**
 * Members who could take over a trip from a departing owner, best first: highest role, then the
 * earliest added, then id so the order is stable. The departing user and unlinked rows (a user
 * already deleted, which nulls `collaborators.userId`) can't inherit and are dropped.
 */
export function orderHeirCandidates<Row extends OwnedTripMemberRow>(
  members: Row[],
  departingUserId: string
): (Row & { userId: string })[] {
  return members
    .filter(
      (candidate): candidate is Row & { userId: string } => !!candidate.userId && candidate.userId !== departingUserId
    )
    .sort(
      (left, right) =>
        heirRoleRank(right.role) - heirRoleRank(left.role) ||
        addedAtValue(left.addedAt) - addedAtValue(right.addedAt) ||
        left.id.localeCompare(right.id)
    );
}

/** Owned trips that still have someone to inherit them; the rest are deleted with the account. */
export function buildSharedOwnedTrips(
  ownedTrips: { id: string; name: string }[],
  members: OwnedTripMemberRow[],
  departingUserId: string
): AccountDeletionTrip[] {
  return ownedTrips.flatMap((trip) => {
    const tripMembers = members.filter((candidate) => candidate.tripId === trip.id);
    const heirs = orderHeirCandidates(tripMembers, departingUserId);
    if (heirs.length === 0) return [];

    return [
      {
        tripId: trip.id,
        name: trip.name,
        memberCount: tripMembers.filter((candidate) => candidate.userId).length,
        collaborators: heirs.map((heir) => ({
          userId: heir.userId,
          name: heir.name,
          role: heir.role as CollaboratorRole,
        })),
        suggestedHeirUserId: heirs[0].userId,
      },
    ];
  });
}

/** True when `choices` holds exactly one valid decision for every shared trip and nothing else. */
export function areDeletionChoicesValid(sharedTrips: AccountDeletionTrip[], choices: TripDeletionChoice[]): boolean {
  if (choices.length !== sharedTrips.length) return false;

  const tripsById = new Map(sharedTrips.map((trip) => [trip.tripId, trip]));
  const decidedTripIds = new Set<string>();

  return choices.every((choice) => {
    const trip = tripsById.get(choice.tripId);
    if (!trip || decidedTripIds.has(choice.tripId)) return false;
    decidedTripIds.add(choice.tripId);

    if (choice.action === TripDeletionAction.Delete) return true;
    if (choice.action === TripDeletionAction.Transfer) {
      return trip.collaborators.some((collaborator) => collaborator.userId === choice.newOwnerUserId);
    }
    return false;
  });
}
