import { and, eq, sql } from "drizzle-orm";
import type { db } from "@/db";
import { collaborators, days, invitations, trips, users } from "@/db/schema";
import { CollaboratorRole } from "@/data/types";
import type { ContributorChange, InviteContributorResult } from "@/data/types";
import { isUniqueViolation } from "@/lib/error-utils";
import { applyInvitationResend } from "@/lib/invitation-resend";
import { lockUsersThenTripForUpdate } from "@/lib/account-lifecycle-locks";
import { lockTripForUpdate, TRIP_NOT_FOUND_MESSAGE } from "@/lib/server-action-locks";

export type MembershipDatabase = Pick<typeof db, "transaction">;

type InvitationRow = typeof invitations.$inferSelect;
type TripInsert = typeof trips.$inferInsert;
type DayInsert = typeof days.$inferInsert;

/**
 * Thrown for expected, user-facing rejections inside the contributor writers' transactions. `stale` marks a
 * concurrent-edit guard failure (row gone, or its role changed since staging) so the caller knows to refetch;
 * unexpected errors stay plain `Error`s and propagate.
 */
export class ContributorChangeGuardError extends Error {
  readonly stale: boolean;

  constructor(message: string, options?: { stale?: boolean }) {
    super(message);
    this.stale = options?.stale ?? false;
  }
}

function assertNotCreator(
  collab: { isCreator: boolean | null },
  message: string,
  ErrorClass: new (message: string) => Error = Error
): void {
  if (collab.isCreator) {
    throw new ErrorClass(message);
  }
}

export interface CreateTripOwner {
  id: string;
  username: string;
  name: string | null;
  currency: string | null;
  transitMode: string | null;
}

export interface PreparedTrip {
  tripValues: Omit<TripInsert, "ownerId">;
  collaboratorName: string;
  buildDayRows: (tripId: string) => DayInsert | DayInsert[];
}

/**
 * Creates a trip owned by `ownerId` under the owner's account lock, so account deletion (which locks the same
 * user row before reading owned trips) either sees the new trip or makes creation fail. `prepare` runs inside
 * the transaction once the owner row is locked.
 */
export async function createTripWrite(
  database: MembershipDatabase,
  ownerId: string,
  prepare: (owner: CreateTripOwner) => PreparedTrip | Promise<PreparedTrip>
): Promise<{ tripId: string; ownerId: string; ownerUsername: string }> {
  return database.transaction(async (tx) => {
    const [user] = await tx
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        currency: users.currency,
        transitMode: users.transitMode,
      })
      .from(users)
      .where(eq(users.id, ownerId))
      .for("update");

    if (!user?.id) {
      throw new Error("Signed-in user could not be resolved before trip creation.");
    }
    const prepared = await prepare(user);

    const [trip] = await tx
      .insert(trips)
      .values({ ...prepared.tripValues, ownerId: user.id })
      .returning();
    await tx.insert(collaborators).values({
      tripId: trip.id,
      userId: user.id,
      name: prepared.collaboratorName,
      initials: prepared.collaboratorName.slice(0, 2).toUpperCase(),
      role: "manager",
      isCreator: true,
    });
    const dayRows = prepared.buildDayRows(trip.id);
    // drizzle's insert accepts one row or many at runtime; the union only trips its overload typing.
    await tx.insert(days).values(dayRows as DayInsert[]);
    return { tripId: trip.id, ownerId: user.id, ownerUsername: user.username };
  });
}

export type InviteContributorWriteResult = InviteContributorResult | { status: "gone" };

export async function inviteContributorWrite(
  database: MembershipDatabase,
  input: { tripId: string; inviterId: string; inviteeId: string; role: CollaboratorRole; expiresAt: Date }
): Promise<InviteContributorWriteResult> {
  const { tripId, inviterId, inviteeId, role, expiresAt } = input;
  return database.transaction(async (transaction): Promise<InviteContributorWriteResult> => {
    // Inviter and invitee are FK targets of the new invitation, so both stay locked until commit: a deletion
    // of either then fails this write cleanly instead of racing it into a key violation.
    const lock = await lockUsersThenTripForUpdate(transaction, [inviterId, inviteeId], tripId);
    if (!lock.locked) {
      if (lock.missing === "user" && lock.userId === inviteeId.toLowerCase()) {
        return { status: "error", message: "No account found for this username", errorCode: "no-account" };
      }
      return { status: "gone" };
    }

    const existingCollaborators = await transaction
      .select({ id: collaborators.id })
      .from(collaborators)
      .where(and(eq(collaborators.tripId, tripId), eq(collaborators.userId, inviteeId)));
    if (existingCollaborators.length > 0) {
      return {
        status: "error",
        message: "This person is already a collaborator on this trip",
        errorCode: "already-collaborator",
      };
    }

    const existingInvitations = await transaction
      .select({ id: invitations.id, status: invitations.status })
      .from(invitations)
      .where(and(eq(invitations.tripId, tripId), eq(invitations.inviteeId, inviteeId)));
    const pendingInvitation = existingInvitations.find((invitation) => invitation.status === "pending");
    if (pendingInvitation) {
      await applyInvitationResend(transaction, pendingInvitation.id, tripId, expiresAt, role);
      return { status: "resent" };
    }

    const declinedInvitation = existingInvitations.find((invitation) => invitation.status === "declined");
    if (declinedInvitation) {
      await transaction.delete(invitations).where(eq(invitations.id, declinedInvitation.id));
    }

    try {
      await transaction.insert(invitations).values({
        tripId,
        inviteeId,
        role,
        status: "pending",
        expiresAt,
        invitedBy: inviterId,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return {
          status: "error",
          message: "This person was just invited by someone else. Try again.",
          errorCode: "invite-conflict",
        };
      }
      throw error;
    }
    return { status: "invited" };
  });
}

export async function acceptInvitationWrite(
  database: MembershipDatabase,
  input: { userId: string; fallbackName: string; invitationId: string }
): Promise<InvitationRow | null> {
  const { userId, fallbackName, invitationId } = input;
  return database.transaction(async (transaction) => {
    // Lock the invitee and the trip before touching the invitation row: deletion holds them and then needs the
    // invitation row (cascade), so taking the row first would let the two wait on each other.
    const [candidate] = await transaction
      .select({ tripId: invitations.tripId })
      .from(invitations)
      .where(and(eq(invitations.id, invitationId), eq(invitations.inviteeId, userId)));
    if (!candidate) return null;
    const lock = await lockUsersThenTripForUpdate(transaction, [userId], candidate.tripId);
    if (!lock.locked) return null;

    const [updatedInvitation] = await transaction
      .update(invitations)
      .set({ status: "accepted" })
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.inviteeId, userId),
          eq(invitations.status, "pending"),
          sql`${invitations.expiresAt} > now()`
        )
      )
      .returning();

    if (!updatedInvitation) {
      return null;
    }

    const [account] = await transaction
      .select({ name: users.name, username: users.username })
      .from(users)
      .where(eq(users.id, userId));
    const userName = account?.name ?? account?.username ?? fallbackName;
    const collaboratorValues = {
      tripId: updatedInvitation.tripId,
      userId,
      name: userName,
      initials: userName.slice(0, 2).toUpperCase(),
      role: updatedInvitation.role,
      isCreator: false,
    };

    await transaction
      .insert(collaborators)
      .values(collaboratorValues)
      .onConflictDoUpdate({
        target: [collaborators.tripId, collaborators.userId],
        set: collaboratorValues,
      });

    return updatedInvitation;
  });
}

export interface ContributorChangeOutcome {
  removedUserIds: string[];
  roleChangedUserIds: string[];
  tripName: string;
  removedByUsername: string;
}

/** Applies a validated batch of role/removal changes all-or-nothing under the trip lock. */
export async function saveContributorChangesWrite(
  database: MembershipDatabase,
  input: { tripId: string; actorId: string; changes: ContributorChange[] }
): Promise<ContributorChangeOutcome> {
  const { tripId, actorId, changes } = input;
  const outcome: ContributorChangeOutcome = {
    removedUserIds: [],
    roleChangedUserIds: [],
    tripName: "",
    removedByUsername: "",
  };

  await database.transaction(async (transaction) => {
    try {
      await lockTripForUpdate(transaction, tripId);
    } catch (error) {
      // Trip deleted (for example with its owner's account) after the caller's access check.
      if (error instanceof Error && error.message === TRIP_NOT_FOUND_MESSAGE) {
        throw new ContributorChangeGuardError("One or more contributors are no longer on this trip.", {
          stale: true,
        });
      }
      throw error;
    }

    const collaboratorsOnTrip = await transaction.select().from(collaborators).where(eq(collaborators.tripId, tripId));
    const collaboratorById = new Map(collaboratorsOnTrip.map((collaborator) => [collaborator.id, collaborator]));

    const myRow = collaboratorsOnTrip.find((collaborator) => collaborator.userId === actorId);
    if (myRow?.role !== CollaboratorRole.Manager) {
      throw new ContributorChangeGuardError("You no longer have permission to manage contributors.", { stale: true });
    }
    const myRowId = myRow.id;

    for (const change of changes) {
      const target = collaboratorById.get(change.collaboratorId);
      if (!target || target.tripId !== tripId) {
        throw new ContributorChangeGuardError("One or more contributors are no longer on this trip.", {
          stale: true,
        });
      }
      assertNotCreator(target, "The trip creator's seat cannot be changed.", ContributorChangeGuardError);
      if (target.id === myRowId) {
        throw new ContributorChangeGuardError("You cannot change your own access.");
      }

      if (change.type === "role") {
        if (target.role !== change.fromRole) {
          throw new ContributorChangeGuardError("A contributor's role changed since you started editing.", {
            stale: true,
          });
        }
        await transaction
          .update(collaborators)
          .set({ role: change.toRole })
          .where(eq(collaborators.id, change.collaboratorId));
        if (target.userId) {
          outcome.roleChangedUserIds.push(target.userId);
        }
      } else {
        await transaction.delete(collaborators).where(eq(collaborators.id, change.collaboratorId));
        if (target.userId) {
          outcome.removedUserIds.push(target.userId);
        }
      }
    }

    if (outcome.removedUserIds.length > 0) {
      const [tripRow] = await transaction.select({ name: trips.name }).from(trips).where(eq(trips.id, tripId));
      outcome.tripName = tripRow?.name ?? "";
      const [remover] = await transaction.select({ username: users.username }).from(users).where(eq(users.id, actorId));
      outcome.removedByUsername = remover?.username ?? "";
    }
  });

  return outcome;
}

export const NOT_ON_TRIP_MESSAGE = "You're no longer on this trip.";

/** Removes `userId`'s own editor/viewer membership under the trip lock; throws `ContributorChangeGuardError` on refusal. */
export async function leaveTripWrite(
  database: MembershipDatabase,
  input: { tripId: string; userId: string }
): Promise<void> {
  const { tripId, userId } = input;
  const ownMembership = and(eq(collaborators.tripId, tripId), eq(collaborators.userId, userId));

  await database.transaction(async (transaction) => {
    try {
      await lockTripForUpdate(transaction, tripId);
    } catch (error) {
      // Trip deleted between the pre-check and the lock: the caller is no longer on it — stale, not a failure.
      if (error instanceof Error && error.message === TRIP_NOT_FOUND_MESSAGE) {
        throw new ContributorChangeGuardError(NOT_ON_TRIP_MESSAGE, { stale: true });
      }
      throw error;
    }

    const [membership] = await transaction
      .select({ id: collaborators.id, role: collaborators.role, isCreator: collaborators.isCreator })
      .from(collaborators)
      .where(ownMembership);
    if (!membership) {
      throw new ContributorChangeGuardError(NOT_ON_TRIP_MESSAGE, { stale: true });
    }
    assertNotCreator(membership, "The trip creator can't leave this trip.", ContributorChangeGuardError);
    if (membership.role !== CollaboratorRole.Editor && membership.role !== CollaboratorRole.Viewer) {
      throw new ContributorChangeGuardError("Managers can't leave a trip.");
    }

    await transaction
      .delete(collaborators)
      .where(and(eq(collaborators.id, membership.id), eq(collaborators.userId, userId)));
  });
}
