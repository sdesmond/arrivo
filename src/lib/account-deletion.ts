import { and, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { collaborators, documents, invitations, trips, users } from "@/db/schema";
import { AccountDeletionFailure, CollaboratorRole, InvitationStatus, TripDeletionAction, UserRole } from "@/data/types";
import type { DeleteOwnAccountResult, TripDeletionChoice } from "@/data/types";
import {
  assertAnotherCompletedAdmin,
  LastCompletedAdminError,
  lockInstanceAndUsersForUpdate,
} from "@/lib/account-lifecycle-locks";
import { lockTripForUpdate } from "@/lib/server-action-locks";
import { areDeletionChoicesValid, buildSharedOwnedTrips } from "@/lib/trip-ownership";

export type AccountDeletionDatabase = Pick<typeof db, "transaction">;

/**
 * Deletes one account in a single transaction. `trips.ownerId` cascades, so every trip the user owns is dealt with
 * first: shared trips go to the collaborator the user picked (promoted to manager and creator) or are deleted because
 * the user chose to; trips nobody else is on are deleted. Lock order (AD-2): instance singleton, user, owned trips.
 * Refusals (stale choices, last completed admin) write nothing. Events, file cleanup and sign-out belong to the caller.
 */
export async function deleteOwnAccount(
  database: AccountDeletionDatabase,
  userId: string,
  choices: TripDeletionChoice[]
): Promise<DeleteOwnAccountResult> {
  const accountId = userId.toLowerCase();

  return database.transaction(async (transaction): Promise<DeleteOwnAccountResult> => {
    const scope = await lockInstanceAndUsersForUpdate(transaction, [accountId]);
    if (!scope.instanceLocked) throw new Error("Instance state not found.");
    if (!scope.lockedUserIds.has(accountId)) throw new Error("User not found.");

    const [account] = await transaction
      .select({ username: users.username, role: users.role, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, accountId));
    if (!account) throw new Error("User not found.");
    // Only a completed admin counts toward the guard, so an unfinished admin leaving never strands the instance.
    if (account.role === UserRole.Admin && account.passwordHash !== null) {
      try {
        await assertAnotherCompletedAdmin(transaction, accountId);
      } catch (error) {
        if (error instanceof LastCompletedAdminError) return { ok: false, reason: AccountDeletionFailure.LastAdmin };
        throw error;
      }
    }

    const ownedTrips = await transaction
      .select({ id: trips.id, name: trips.name, coverImageUrl: trips.coverImageUrl })
      .from(trips)
      .where(eq(trips.ownerId, accountId));
    for (const trip of ownedTrips) {
      await lockTripForUpdate(transaction, trip.id);
    }

    const ownedTripIds = ownedTrips.map((trip) => trip.id);
    const members =
      ownedTripIds.length > 0
        ? await transaction
            .select({
              id: collaborators.id,
              tripId: collaborators.tripId,
              userId: collaborators.userId,
              name: collaborators.name,
              role: collaborators.role,
              addedAt: collaborators.addedAt,
            })
            .from(collaborators)
            .where(inArray(collaborators.tripId, ownedTripIds))
        : [];

    // The dialog's choices were made against an earlier read; a trip gaining or losing members since
    // then must be shown again rather than resolved by a guess.
    if (!areDeletionChoicesValid(buildSharedOwnedTrips(ownedTrips, members, accountId), choices)) {
      return { ok: false, reason: AccountDeletionFailure.Stale };
    }

    // Cancel invitations before ownership moves so nobody joins a trip on the departing user's say-so.
    const rescindedInvitations = await transaction
      .update(invitations)
      .set({ status: InvitationStatus.Rescinded })
      .where(and(eq(invitations.invitedBy, accountId), eq(invitations.status, InvitationStatus.Pending)))
      .returning({ inviteeId: invitations.inviteeId, tripId: invitations.tripId });

    const heirByTripId = new Map(
      choices.flatMap((choice) =>
        choice.action === TripDeletionAction.Transfer ? [[choice.tripId, choice.newOwnerUserId] as const] : []
      )
    );
    const deletedTrips = ownedTrips.filter((trip) => !heirByTripId.has(trip.id));
    const deletedTripIds = deletedTrips.map((trip) => trip.id);

    const deletedTripDocuments =
      deletedTripIds.length > 0
        ? await transaction
            .select({ url: documents.url })
            .from(documents)
            .where(inArray(documents.tripId, deletedTripIds))
        : [];
    if (deletedTripIds.length > 0) {
      await transaction.delete(trips).where(inArray(trips.id, deletedTripIds));
    }

    for (const [tripId, heirUserId] of heirByTripId) {
      await transaction.update(trips).set({ ownerId: heirUserId }).where(eq(trips.id, tripId));
      await transaction
        .update(collaborators)
        .set({ role: CollaboratorRole.Manager, isCreator: true })
        .where(and(eq(collaborators.tripId, tripId), eq(collaborators.userId, heirUserId)));
    }

    const departedMemberships = await transaction
      .delete(collaborators)
      .where(eq(collaborators.userId, accountId))
      .returning({ tripId: collaborators.tripId });
    await transaction.delete(users).where(eq(users.id, accountId));

    return {
      ok: true,
      summary: {
        rescindedInvitations,
        transferredTrips: [...heirByTripId],
        deletedTripIds,
        deletedTripMembers: members.flatMap((member) =>
          member.userId && member.userId !== accountId && deletedTripIds.includes(member.tripId)
            ? [{ tripId: member.tripId, userId: member.userId }]
            : []
        ),
        remainingTripIds: departedMemberships.map((membership) => membership.tripId),
        storageUrls: [
          ...deletedTripDocuments.map((tripDocument) => tripDocument.url),
          ...deletedTrips.map((trip) => trip.coverImageUrl),
        ].filter((url): url is string => !!url),
        account: { id: accountId, username: account.username },
      },
    };
  });
}
