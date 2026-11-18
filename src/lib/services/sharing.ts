import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, getTableColumns, gt, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { collaborators, idempotencyKeys, invitations, users } from "@/db/schema";
import { LiveSyncEventType } from "@/data/types";
import type {
  AcceptInvitationResult,
  Actor,
  DeclineInvitationResult,
  IdempotentRequest,
  InviteContributorResult,
  SaveContributorChangesResult,
  ShareDialogData,
  ResendInvitationResult,
  RescindInvitationResult,
  DismissInvitationResult,
} from "@/data/types";
import * as contract from "@/lib/api/contract/sharing";
import { withIdempotency, fingerprintRequest } from "@/lib/api/idempotency";
import { lockUsersThenTripForUpdate } from "@/lib/account-lifecycle-locks";
import { dbCollabToType, dbInvitationToType } from "@/lib/db-mappers";
import { getInvitableUsers } from "@/lib/invitable-users";
import { applyInvitationResend } from "@/lib/invitation-resend";
import { getInvitationExpiry, hasNormalizedUsername } from "@/lib/invitations";
import { IDEMPOTENCY_RETENTION_MS } from "@/lib/idempotency-retention";
import {
  acceptInvitationInTransaction,
  ContributorChangeGuardError,
  declineInvitationInTransaction,
  deleteOwnMembership,
  rescindInvitationInTransaction,
  dismissInvitationInTransaction,
  describeUnmatchedInvitationInTransaction,
  inviteContributorInTransaction,
  NO_LONGER_ON_TRIP_MESSAGE,
  readLeavableMembership,
  saveContributorChangesInTransaction,
  type ContributorChangeOutcome,
} from "@/lib/membership-writes";
import { getNow } from "@/lib/mock-date";
import { isUuid } from "@/lib/validation-limits";
import { guardTransactionDeadline } from "@/lib/request-deadline";
import { recordTripInvitation } from "@/lib/trip-activity";
import { lockTripForUpdate, TRIP_NOT_FOUND_MESSAGE } from "@/lib/server-action-locks";
import { publishTripEvent, publishUserEvent, removeTripSubscribersForUser } from "@/lib/trip-events";
import { lockClientIds } from "./client-ids";
import { ConflictError } from "./conflict-error";
import { requireTripRole, TripNotFoundError } from "./trip-access";
import { ValidationFailedError } from "./validation-failed-error";

export async function getCollaborators(actor: Actor, tripId: string): Promise<ShareDialogData> {
  tripId = contract.getCollaborators.params.parse({ tripId }).tripId;
  await requireTripRole(tripId, actor.userId, "manager");
  const [members, invites] = await Promise.all([
    db
      .select({ ...getTableColumns(collaborators), username: users.username, image: users.image })
      .from(collaborators)
      .leftJoin(users, eq(collaborators.userId, users.id))
      .where(eq(collaborators.tripId, tripId)),
    db
      .select({ ...getTableColumns(invitations), inviteeUsername: users.username })
      .from(invitations)
      .innerJoin(users, eq(invitations.inviteeId, users.id))
      .where(
        and(eq(invitations.tripId, tripId), or(eq(invitations.status, "pending"), eq(invitations.status, "declined")))
      ),
  ]);
  return {
    collaborators: members.map(dbCollabToType),
    currentCollaboratorId: members.find((member) => member.userId === actor.userId)?.id ?? null,
    invitations: invites.map(dbInvitationToType),
  };
}

export async function listInvitableUsers(actor: Actor, tripId: string) {
  tripId = contract.listInvitableUsers.body.parse({ tripId }).tripId;
  await requireTripRole(tripId, actor.userId, "manager");
  return getInvitableUsers(tripId, actor.userId);
}

interface InvitationIntent {
  tripId: string;
  fingerprint: string;
  invitationId: string;
  result: InviteContributorResult;
}

function readInvitationIntent(value: unknown): InvitationIntent {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const candidate = value as Record<string, unknown>;
    const result = candidate.result;
    if (
      typeof candidate.tripId === "string" &&
      isUuid(candidate.tripId) &&
      typeof candidate.invitationId === "string" &&
      isUuid(candidate.invitationId) &&
      typeof candidate.fingerprint === "string" &&
      /^[a-f0-9]{64}$/.test(candidate.fingerprint) &&
      result !== null &&
      typeof result === "object" &&
      "status" in result &&
      (result.status === "invited" || result.status === "resent")
    )
      return candidate as unknown as InvitationIntent;
  }
  throw new ConflictError("This ID is claimed by incompatible replay evidence.");
}

/** Atomic sharing write. Resource authorization precedes both header and UUID replay reads. */
export async function createInvitation(
  actor: Actor,
  tripId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<InviteContributorResult> {
  tripId = contract.createInvitation.params.parse({ tripId }).tripId;
  const draft = contract.createInvitation.body.parse(input);
  await requireTripRole(tripId, actor.userId, "manager");
  // Lookup only discovers lock targets; account existence is rechecked by the account locks.
  const [invitee] = await db
    .select({ id: users.id })
    .from(users)
    .where(hasNormalizedUsername(users.username, draft.username));
  let changed = false;
  const outcome = await db.transaction((transaction) =>
    guardTransactionDeadline(transaction, () =>
      withIdempotency<InviteContributorResult>(
        transaction,
        { actor, request: replay, payload: draft },
        {
          authorize: async () => {
            await lockClientIds(transaction, [draft.id && `invitation:${draft.id}`]);
            const lock = await lockUsersThenTripForUpdate(
              transaction,
              [actor.userId, ...(invitee ? [invitee.id] : [])],
              tripId
            );
            if (!lock.locked) {
              if (lock.missing !== "user" || lock.userId !== invitee?.id) throw new TripNotFoundError();
              const fallbackLock = await lockUsersThenTripForUpdate(transaction, [actor.userId], tripId);
              if (!fallbackLock.locked) throw new TripNotFoundError();
            }
            await requireTripRole(tripId, actor.userId, "manager", transaction);
          },
          mutate: async () => {
            const intentKey = draft.id ? `invitation-intent:${draft.id}` : undefined;
            const fingerprint = fingerprintRequest("POST", `/api/v1/trips/${tripId}/invitations`, draft);
            if (intentKey) {
              const [claim] = await transaction
                .select({ userId: idempotencyKeys.userId, result: idempotencyKeys.result })
                .from(idempotencyKeys)
                .where(
                  and(
                    eq(idempotencyKeys.key, intentKey),
                    gt(idempotencyKeys.createdAt, new Date(getNow().getTime() - IDEMPOTENCY_RETENTION_MS))
                  )
                );
              if (claim) {
                const intent = readInvitationIntent(claim.result);
                if (intent.tripId !== tripId) await requireTripRole(intent.tripId, actor.userId, "viewer", transaction);
                if (intent.tripId !== tripId || claim.userId !== actor.userId || intent.fingerprint !== fingerprint)
                  throw new ConflictError("This ID was already used for a different invitation.");
                const [current] = await transaction
                  .select({ id: invitations.id })
                  .from(invitations)
                  .where(
                    and(
                      eq(invitations.id, intent.invitationId),
                      eq(invitations.tripId, tripId),
                      eq(invitations.status, "pending")
                    )
                  );
                if (!current)
                  throw new ConflictError("This invitation intent is retired. Send a fresh invitation with a new ID.");
                return intent.result;
              }
              const [existing] = await transaction
                .select({ tripId: invitations.tripId })
                .from(invitations)
                .where(eq(invitations.id, draft.id!));
              if (existing) {
                if (existing.tripId !== tripId)
                  await requireTripRole(existing.tripId, actor.userId, "viewer", transaction);
                throw new ConflictError("This ID was already used for an invitation.");
              }
            }
            const missing = {
              status: "error",
              message: "No account found for this username",
              errorCode: "no-account",
            } as const;
            if (!invitee) return missing;
            if (invitee.id === actor.userId)
              return { status: "error", message: "You cannot invite yourself to this trip", errorCode: "self-invite" };
            const [account] = await transaction.select({ id: users.id }).from(users).where(eq(users.id, invitee.id));
            if (!account) return missing;
            const id = draft.id ?? randomUUID();
            const result = await inviteContributorInTransaction(transaction, {
              tripId,
              inviterId: actor.userId,
              inviteeId: invitee.id,
              role: draft.role,
              expiresAt: getInvitationExpiry(),
              id,
            });
            if (result.status === "error") return result;
            if (intentKey) {
              const [pending] = await transaction
                .select({ id: invitations.id })
                .from(invitations)
                .where(
                  and(
                    eq(invitations.tripId, tripId),
                    eq(invitations.inviteeId, invitee.id),
                    eq(invitations.status, "pending")
                  )
                );
              const intent: InvitationIntent = { tripId, fingerprint, invitationId: pending?.id ?? id, result };
              await transaction
                .insert(idempotencyKeys)
                .values({ key: intentKey, userId: actor.userId, result: intent, createdAt: getNow() })
                .onConflictDoUpdate({
                  target: [idempotencyKeys.key, idempotencyKeys.userId],
                  set: { result: intent, createdAt: getNow() },
                });
            }
            changed = true;
            return result;
          },
        }
      )
    )
  );
  if (changed && !outcome.replayed && invitee) {
    if (outcome.value.status === "invited") recordTripInvitation("invitation_created", actor.userId, tripId);
    publishUserEvent(invitee.id, { type: LiveSyncEventType.InvitationChanged, tripId });
    publishTripEvent(tripId, { type: LiveSyncEventType.MembershipChanged, tripId });
    revalidatePath(`/trips/${tripId}`);
  }
  return outcome.value;
}

/**
 * Atomic contributor role/removal batch. The trip lock and locked manager recheck precede the replay lookup, so a
 * demoted manager never sees a saved response. Guard refusals roll the whole batch back: stale ones are conflicts the
 * client recovers from by reloading, the rest are validation failures.
 */
export async function saveContributorChanges(
  actor: Actor,
  tripId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<SaveContributorChangesResult> {
  tripId = contract.saveContributorChanges.params.parse({ tripId }).tripId;
  const draft = contract.saveContributorChanges.body.parse(input);
  await requireTripRole(tripId, actor.userId, "manager");
  let applied = undefined as ContributorChangeOutcome | undefined;
  const outcome = await db.transaction((transaction) =>
    guardTransactionDeadline(transaction, () =>
      withIdempotency<SaveContributorChangesResult>(
        transaction,
        { actor, request: replay, payload: draft },
        {
          authorize: async () => {
            try {
              await lockTripForUpdate(transaction, tripId);
            } catch (error) {
              // Deleted after the precheck, for example with its owner's account: the staged rows are stale.
              if (error instanceof Error && error.message === TRIP_NOT_FOUND_MESSAGE)
                throw new ConflictError(NO_LONGER_ON_TRIP_MESSAGE);
              throw error;
            }
            await requireTripRole(tripId, actor.userId, "manager", transaction);
          },
          mutate: async () => {
            if (draft.changes.length === 0) return { status: "success" };
            try {
              applied = await saveContributorChangesInTransaction(transaction, {
                tripId,
                actorId: actor.userId,
                changes: draft.changes,
              });
            } catch (error) {
              if (error instanceof ContributorChangeGuardError) {
                if (error.stale) throw new ConflictError(error.message);
                throw new ValidationFailedError(error.message, { changes: [error.message] });
              }
              throw error;
            }
            return { status: "success" };
          },
        }
      )
    )
  );
  if (applied && !outcome.replayed) {
    const { removedUserIds, roleChangedUserIds, tripName, removedByName, removedByUsername } = applied;
    for (const removedUserId of removedUserIds) {
      publishUserEvent(removedUserId, {
        type: LiveSyncEventType.MembershipRemoved,
        removedUserId,
        tripId,
        tripName,
        removedByName,
        removedByUsername,
      });
      removeTripSubscribersForUser(tripId, removedUserId);
    }
    for (const roleChangedUserId of roleChangedUserIds) {
      publishUserEvent(roleChangedUserId, { type: LiveSyncEventType.MembershipChanged, tripId });
    }
    // Every open session on the trip channel needs the change, not only the removed or re-roled users.
    publishTripEvent(tripId, { type: LiveSyncEventType.MembershipChanged, tripId });
    revalidatePath(`/trips/${tripId}`);
    revalidatePath("/trips");
  }
  return outcome.value;
}

/**
 * Invitee decision on one invitation. Authorization is the addressed recipient, not trip membership: an unknown or
 * foreign invitation is concealed as not found. The pre-lookup only finds lock targets; the row is re-verified under
 * the user then trip locks, before the replay lookup, so account deletion cannot interleave and a stale actor never
 * reads a saved response.
 */
async function decideInvitation<Result extends AcceptInvitationResult | DeclineInvitationResult>(
  actor: Actor,
  invitationId: string,
  decision: "accept" | "decline",
  replay?: IdempotentRequest
): Promise<Result> {
  const [addressed] = await db
    .select({ tripId: invitations.tripId })
    .from(invitations)
    .where(and(eq(invitations.id, invitationId), eq(invitations.inviteeId, actor.userId)));
  if (!addressed) throw new TripNotFoundError();
  let decided: { tripId: string } | undefined;
  const outcome = await db.transaction((transaction) =>
    guardTransactionDeadline(transaction, () =>
      withIdempotency<Result>(
        transaction,
        { actor, request: replay, payload: {} },
        {
          authorize: async () => {
            const lock = await lockUsersThenTripForUpdate(transaction, [actor.userId], addressed.tripId);
            if (!lock.locked) throw new TripNotFoundError();
            const [current] = await transaction
              .select({ id: invitations.id })
              .from(invitations)
              .where(and(eq(invitations.id, invitationId), eq(invitations.inviteeId, actor.userId)));
            if (!current) throw new TripNotFoundError();
          },
          mutate: async () => {
            const row =
              decision === "accept"
                ? await acceptInvitationInTransaction(transaction, {
                    userId: actor.userId,
                    fallbackName: "",
                    invitationId,
                  })
                : await declineInvitationInTransaction(transaction, { userId: actor.userId, invitationId });
            if (!row)
              throw new ConflictError(
                await describeUnmatchedInvitationInTransaction(transaction, invitationId, actor.userId)
              );
            decided = row;
            return (
              decision === "accept" ? { status: "accepted", tripId: row.tripId } : { status: "declined" }
            ) as Result;
          },
        }
      )
    )
  );
  if (decided && !outcome.replayed) {
    const { tripId } = decided;
    if (decision === "accept") recordTripInvitation("invitation_accepted", actor.userId, tripId);
    publishTripEvent(tripId, { type: LiveSyncEventType.MembershipChanged, tripId });
    publishUserEvent(actor.userId, { type: LiveSyncEventType.MembershipChanged, tripId });
    // The actor's other tabs drop the invitation from their sidebar badge.
    publishUserEvent(actor.userId, { type: LiveSyncEventType.InvitationChanged, tripId });
    revalidatePath("/trips");
    revalidatePath(`/trips/${tripId}`);
  }
  return outcome.value;
}

export async function acceptInvitation(
  actor: Actor,
  invitationId: string,
  replay?: IdempotentRequest
): Promise<AcceptInvitationResult> {
  invitationId = contract.acceptInvitation.params.parse({ invitationId }).invitationId;
  return decideInvitation<AcceptInvitationResult>(actor, invitationId, "accept", replay);
}

export async function declineInvitation(
  actor: Actor,
  invitationId: string,
  replay?: IdempotentRequest
): Promise<DeclineInvitationResult> {
  invitationId = contract.declineInvitation.params.parse({ invitationId }).invitationId;
  return decideInvitation<DeclineInvitationResult>(actor, invitationId, "decline", replay);
}

/** Manager lifecycle writes authorize the supplied trip under lock before replay lookup. */
async function transitionInvitation(
  actor: Actor,
  tripId: string,
  invitationId: string,
  operation: "resend" | "rescind" | "dismiss",
  replay?: IdempotentRequest
): Promise<ResendInvitationResult | RescindInvitationResult | DismissInvitationResult> {
  invitationId = contract.resendInvitation.params.parse({ invitationId }).invitationId;
  tripId = contract.getCollaborators.params.parse({ tripId }).tripId;
  let changed: { inviteeId: string } | undefined;
  const outcome = await db.transaction((transaction) =>
    guardTransactionDeadline(transaction, () =>
      withIdempotency<ResendInvitationResult | RescindInvitationResult | DismissInvitationResult>(
        transaction,
        { actor, request: replay, payload: operation === "rescind" ? {} : { tripId } },
        {
          authorize: async () => {
            const lock = await lockUsersThenTripForUpdate(transaction, [actor.userId], tripId);
            if (!lock.locked) throw new TripNotFoundError();
            await requireTripRole(tripId, actor.userId, "manager", transaction);
          },
          mutate: async () => {
            if (operation === "resend") {
              const result = await applyInvitationResend(transaction, invitationId, tripId, getInvitationExpiry());
              if (result.status === "error") {
                if (result.message === "Invitation not found.") throw new TripNotFoundError();
                throw new ConflictError(result.message);
              }
              changed = result;
              return { status: "success", expiresAt: result.expiresAt };
            }
            const input = { tripId, invitationId };
            const row =
              operation === "rescind"
                ? await rescindInvitationInTransaction(transaction, input)
                : await dismissInvitationInTransaction(transaction, input);
            if (!row) {
              const [existing] = await transaction
                .select({ id: invitations.id })
                .from(invitations)
                .where(and(eq(invitations.id, invitationId), eq(invitations.tripId, tripId)));
              if (!existing) throw new TripNotFoundError();
              throw new ConflictError(
                operation === "rescind" ? "Invitation is no longer pending." : "Invitation is still pending."
              );
            }
            changed = row;
            return { status: "success" };
          },
        }
      )
    )
  );
  if (changed && !outcome.replayed) {
    if (operation === "rescind") recordTripInvitation("invitation_rescinded", actor.userId, tripId);
    publishTripEvent(tripId, { type: LiveSyncEventType.MembershipChanged, tripId });
    if (operation !== "dismiss")
      publishUserEvent(changed.inviteeId, { type: LiveSyncEventType.InvitationChanged, tripId });
    if (operation !== "resend") revalidatePath("/trips");
    revalidatePath(`/trips/${tripId}`);
  }
  return outcome.value;
}
export async function resendInvitation(
  actor: Actor,
  tripId: string,
  invitationId: string,
  replay?: IdempotentRequest
): Promise<ResendInvitationResult> {
  return transitionInvitation(actor, tripId, invitationId, "resend", replay) as Promise<ResendInvitationResult>;
}
export async function rescindInvitation(
  actor: Actor,
  tripId: string,
  invitationId: string,
  replay?: IdempotentRequest
): Promise<RescindInvitationResult> {
  return transitionInvitation(actor, tripId, invitationId, "rescind", replay) as Promise<RescindInvitationResult>;
}
export async function dismissInvitation(
  actor: Actor,
  tripId: string,
  invitationId: string,
  replay?: IdempotentRequest
): Promise<DismissInvitationResult> {
  return transitionInvitation(actor, tripId, invitationId, "dismiss", replay) as Promise<DismissInvitationResult>;
}

/** Private: absence is answered as success outside the transaction so no replay row is read or written. */
class MembershipAbsentError extends Error {}

/**
 * Self-departure. Absence (never joined, already left, foreign or missing trip) is the same empty success and never
 * reads replay or reveals trip data. Under the actor-key and trip locks the membership is rechecked and protected roles
 * refused before any saved response is read, so a rejoined member's old key cannot remove the new membership.
 */
export async function leaveTrip(actor: Actor, tripId: string, replay?: IdempotentRequest): Promise<null> {
  tripId = contract.leaveTrip.params.parse({ tripId }).tripId;
  let membershipId: string | undefined;
  let outcome: Awaited<ReturnType<typeof withIdempotency<null>>>;
  try {
    outcome = await db.transaction((transaction) =>
      guardTransactionDeadline(transaction, () =>
        withIdempotency<null>(
          transaction,
          { actor, request: replay, payload: {} },
          {
            authorize: async () => {
              try {
                await lockTripForUpdate(transaction, tripId);
              } catch (error) {
                if (error instanceof Error && error.message === TRIP_NOT_FOUND_MESSAGE)
                  throw new MembershipAbsentError();
                throw error;
              }
              try {
                membershipId = (await readLeavableMembership(transaction, { tripId, userId: actor.userId })).id;
              } catch (error) {
                if (error instanceof ContributorChangeGuardError) {
                  if (error.stale) throw new MembershipAbsentError();
                  throw new ValidationFailedError(error.message, { tripId: [error.message] });
                }
                throw error;
              }
            },
            mutate: async () => {
              await deleteOwnMembership(transaction, { membershipId: membershipId!, userId: actor.userId });
              return null;
            },
          }
        )
      )
    );
  } catch (error) {
    if (error instanceof MembershipAbsentError) return null;
    throw error;
  }
  if (membershipId && !outcome.replayed) {
    // Personal event first so the leaver's other tabs redirect, then close their trip streams before the
    // trip-wide broadcast, otherwise those tabs would refresh into a denied page on membership-changed.
    publishUserEvent(actor.userId, { type: LiveSyncEventType.MembershipLeft, tripId });
    removeTripSubscribersForUser(tripId, actor.userId);
    publishTripEvent(tripId, { type: LiveSyncEventType.MembershipChanged, tripId });
    revalidatePath(`/trips/${tripId}`);
    revalidatePath("/trips");
  }
  return null;
}
