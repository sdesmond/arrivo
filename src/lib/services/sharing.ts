import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, getTableColumns, gt, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { collaborators, idempotencyKeys, invitations, users } from "@/db/schema";
import { LiveSyncEventType } from "@/data/types";
import type { Actor, IdempotentRequest, InviteContributorResult, ShareDialogData } from "@/data/types";
import * as contract from "@/lib/api/contract/sharing";
import { withIdempotency, fingerprintRequest } from "@/lib/api/idempotency";
import { lockUsersThenTripForUpdate } from "@/lib/account-lifecycle-locks";
import { dbCollabToType, dbInvitationToType } from "@/lib/db-mappers";
import { getInvitableUsers } from "@/lib/invitable-users";
import { getInvitationExpiry, hasNormalizedUsername } from "@/lib/invitations";
import { IDEMPOTENCY_RETENTION_MS } from "@/lib/idempotency-retention";
import { inviteContributorInTransaction } from "@/lib/membership-writes";
import { getNow } from "@/lib/mock-date";
import { isUuid } from "@/lib/validation-limits";
import { guardTransactionDeadline } from "@/lib/request-deadline";
import { recordTripInvitation } from "@/lib/trip-activity";
import { publishTripEvent, publishUserEvent } from "@/lib/trip-events";
import { lockClientIds } from "./client-ids";
import { ConflictError } from "./conflict-error";
import { requireTripRole, TripNotFoundError } from "./trip-access";

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
