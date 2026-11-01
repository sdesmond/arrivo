import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { collaborators, documents, invitations, trips, users } from "@/db/schema";
import {
  AccountDeletionFailure,
  AdminDeletionFailure,
  CollaboratorRole,
  InvitationStatus,
  TripDeletionAction,
  UserRole,
} from "@/data/types";
import type {
  ActivityIdentity,
  AdminDeletionOutcome,
  AdminDeletionPreview,
  AdminDeletionPreviewResult,
  DeletedAccountSummary,
  DeleteOwnAccountResult,
  TripDeletionChoice,
} from "@/data/types";
import {
  assertAnotherCompletedAdmin,
  LastCompletedAdminError,
  lockAppAndUsersForUpdate,
} from "@/lib/account-lifecycle-locks";
import { lockTripForUpdate, TRIP_NOT_FOUND_MESSAGE } from "@/lib/server-action-locks";
import type { DbTransaction } from "@/lib/server-action-locks";
import { areDeletionChoicesValid, buildSharedOwnedTrips } from "@/lib/trip-ownership";

export type AccountDeletionDatabase = Pick<typeof db, "transaction">;

/**
 * Deletes one account in a single transaction. `trips.ownerId` cascades, so every trip the user owns is dealt with
 * first: shared trips go to the collaborator the user picked (promoted to manager and creator) or are deleted because
 * the user chose to; trips nobody else is on are deleted. Lock order (AD-2): app singleton, sorted account/successors, sorted owned trips.
 * Refusals (stale choices, last completed admin) write nothing. Events, file cleanup and sign-out belong to the caller.
 */
export async function deleteOwnAccount(
  database: AccountDeletionDatabase,
  userId: string,
  choices: TripDeletionChoice[],
  sessionVersion: number | undefined
): Promise<DeleteOwnAccountResult> {
  if (sessionVersion === undefined) return { ok: false, reason: AccountDeletionFailure.Unauthorized };
  if (
    !Array.isArray(choices) ||
    choices.some(
      (choice) =>
        !choice ||
        typeof choice.tripId !== "string" ||
        (choice.action !== TripDeletionAction.Delete && choice.action !== TripDeletionAction.Transfer) ||
        (choice.action === TripDeletionAction.Transfer &&
          (typeof choice.newOwnerUserId !== "string" || !UUID_PATTERN.test(choice.newOwnerUserId)))
    )
  )
    return { ok: false, reason: AccountDeletionFailure.Stale };
  const accountId = userId.toLowerCase();
  const heirIds = choices.flatMap((choice) =>
    choice.action === TripDeletionAction.Transfer ? [choice.newOwnerUserId] : []
  );

  return database.transaction(async (transaction): Promise<DeleteOwnAccountResult> => {
    const scope = await lockAppAndUsersForUpdate(transaction, [accountId, ...heirIds]);
    if (!scope.appLocked) throw new Error("App state not found.");
    if (!scope.lockedUserIds.has(accountId)) return { ok: false, reason: AccountDeletionFailure.Unauthorized };

    const [account] = await transaction
      .select({
        username: users.username,
        role: users.role,
        passwordHash: users.passwordHash,
        sessionVersion: users.sessionVersion,
      })
      .from(users)
      .where(eq(users.id, accountId));
    if (!account || account.sessionVersion !== sessionVersion)
      return { ok: false, reason: AccountDeletionFailure.Unauthorized };
    if (heirIds.some((heirId) => !scope.lockedUserIds.has(heirId.toLowerCase())))
      return { ok: false, reason: AccountDeletionFailure.Stale };
    // Only a completed admin counts toward the guard, so an unfinished admin leaving never strands the app.
    if (account.role === UserRole.Admin && account.passwordHash !== null) {
      try {
        await assertAnotherCompletedAdmin(transaction, accountId);
      } catch (error) {
        if (error instanceof LastCompletedAdminError) return { ok: false, reason: AccountDeletionFailure.LastAdmin };
        throw error;
      }
    }

    const ownedTrips = (await selectOwnedTrips(transaction, accountId)).sort((left, right) =>
      compareText(left.id, right.id)
    );
    try {
      for (const trip of ownedTrips) await lockTripForUpdate(transaction, trip.id);
    } catch (error) {
      if (error instanceof Error && error.message === TRIP_NOT_FOUND_MESSAGE)
        return { ok: false, reason: AccountDeletionFailure.Stale };
      throw error;
    }

    const members = await selectMembers(
      transaction,
      ownedTrips.map((trip) => trip.id)
    );

    // The dialog's choices were made against an earlier read; a trip gaining or losing members since
    // then must be shown again rather than resolved by a guess.
    if (!areDeletionChoicesValid(buildSharedOwnedTrips(ownedTrips, members, accountId), choices)) {
      return { ok: false, reason: AccountDeletionFailure.Stale };
    }

    const heirByTripId = new Map(
      choices.flatMap((choice) =>
        choice.action === TripDeletionAction.Transfer ? [[choice.tripId, choice.newOwnerUserId] as const] : []
      )
    );
    return {
      ok: true,
      summary: await removeAccount(transaction, {
        account: { id: accountId, username: account.username },
        ownedTrips,
        members,
        heirByTripId,
        clearCreators: false,
      }),
    };
  });
}

interface OwnedTrip {
  id: string;
  name: string;
  coverImageUrl: string | null;
}

interface TripMember {
  id: string;
  tripId: string;
  userId: string | null;
  name: string;
  role: string;
  addedAt: Date | null;
}

function selectOwnedTrips(transaction: DbTransaction, ownerId: string): Promise<OwnedTrip[]> {
  return transaction
    .select({ id: trips.id, name: trips.name, coverImageUrl: trips.coverImageUrl })
    .from(trips)
    .where(eq(trips.ownerId, ownerId));
}

async function selectMembers(transaction: DbTransaction, tripIds: string[]): Promise<TripMember[]> {
  if (tripIds.length === 0) return [];
  return transaction
    .select({
      id: collaborators.id,
      tripId: collaborators.tripId,
      userId: collaborators.userId,
      name: collaborators.name,
      role: collaborators.role,
      addedAt: collaborators.addedAt,
    })
    .from(collaborators)
    .where(inArray(collaborators.tripId, tripIds));
}

interface AccountRemoval {
  account: { id: string; username: string };
  ownedTrips: OwnedTrip[];
  members: TripMember[];
  /** Trip ID to the member who takes it over; every other owned trip is deleted. */
  heirByTripId: Map<string, string>;
  /** Admin succession makes the heir the trip's only creator; self-service keeps existing creator flags. */
  clearCreators: boolean;
}

/**
 * The writes both deletion flows share, run under the caller's locks: cancel the account's sent invitations before any
 * ownership moves, delete the trips without an heir, promote each heir, then drop the memberships and the account.
 * Authorizations and invitations addressed to the account cascade with the user row.
 */
async function removeAccount(transaction: DbTransaction, removal: AccountRemoval): Promise<DeletedAccountSummary> {
  const { account, ownedTrips, members, heirByTripId, clearCreators } = removal;
  const rescindedInvitations = await transaction
    .update(invitations)
    .set({ status: InvitationStatus.Rescinded })
    .where(and(eq(invitations.invitedBy, account.id), eq(invitations.status, InvitationStatus.Pending)))
    .returning({ inviteeId: invitations.inviteeId, tripId: invitations.tripId });

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
    if (clearCreators) {
      await transaction.update(collaborators).set({ isCreator: false }).where(eq(collaborators.tripId, tripId));
    }
    await transaction.update(trips).set({ ownerId: heirUserId }).where(eq(trips.id, tripId));
    await transaction
      .update(collaborators)
      .set({ role: CollaboratorRole.Manager, isCreator: true })
      .where(and(eq(collaborators.tripId, tripId), eq(collaborators.userId, heirUserId)));
  }

  const departedMemberships = await transaction
    .delete(collaborators)
    .where(eq(collaborators.userId, account.id))
    .returning({ tripId: collaborators.tripId });
  await transaction.delete(users).where(eq(users.id, account.id));

  return {
    rescindedInvitations,
    transferredTrips: [...heirByTripId],
    deletedTripIds,
    deletedTripMembers: members.flatMap((member) =>
      member.userId && member.userId !== account.id && deletedTripIds.includes(member.tripId)
        ? [{ tripId: member.tripId, userId: member.userId }]
        : []
    ),
    remainingTripIds: departedMemberships.map((membership) => membership.tripId),
    storageUrls: [
      ...deletedTripDocuments.map((tripDocument) => tripDocument.url),
      ...deletedTrips.map((trip) => trip.coverImageUrl),
    ].filter((url): url is string => !!url),
    account,
  };
}

const SUCCESSOR_TIER: Record<string, number> = { [CollaboratorRole.Manager]: 0, [CollaboratorRole.Editor]: 1 };

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * The account that inherits a trip when its owner is deleted by an admin: only remaining account-backed managers and
 * editors qualify, managers first, then earliest added, then lowest user ID. Null means nobody can, so the trip goes.
 */
export function pickSuccessor(
  members: readonly Pick<TripMember, "userId" | "role" | "addedAt">[],
  departingUserId: string
): string | null {
  const eligible = members.flatMap((member) =>
    member.userId && member.userId !== departingUserId && member.role in SUCCESSOR_TIER
      ? [{ userId: member.userId, tier: SUCCESSOR_TIER[member.role], addedAt: member.addedAt?.getTime() ?? Infinity }]
      : []
  );
  eligible.sort((left, right) =>
    left.tier !== right.tier
      ? left.tier - right.tier
      : left.addedAt !== right.addedAt
        ? left.addedAt - right.addedAt
        : compareText(left.userId, right.userId)
  );
  return eligible[0]?.userId ?? null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LOCK_ATTEMPTS = 3;

function retryable(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (code === "40P01" || code === "40001") return true;
    current = cause;
  }
  return false;
}

interface TripOutcome {
  trip: OwnedTrip;
  successorUserId: string | null;
}

function fingerprintSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET env var is missing — required to fingerprint account deletion previews.");
  return secret;
}

// Keyed so a client holding a fingerprint cannot test guesses at trip IDs or successors against it.
function outcomeFingerprint(targetId: string, setupComplete: boolean, outcomes: TripOutcome[]): string {
  const canonical = JSON.stringify([
    "account-deletion/v1",
    targetId,
    setupComplete,
    outcomes.map((outcome) => [outcome.trip.id, outcome.successorUserId]),
  ]);
  return createHmac("sha256", fingerprintSecret()).update(canonical).digest("base64url");
}

function fingerprintMatches(expected: string, submitted: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const submittedBytes = Buffer.from(submitted);
  return expectedBytes.length === submittedBytes.length && timingSafeEqual(expectedBytes, submittedBytes);
}

export interface AdminActor {
  id: string;
  sessionVersion?: number;
}

type AdminAttempt =
  | { kind: "widened" }
  | { kind: "refused"; reason: AdminDeletionFailure }
  | {
      kind: "resolved";
      preview: AdminDeletionPreview;
      actor: { id: string; username: string };
      removal: AccountRemoval;
    };

async function lockAndResolve(
  transaction: DbTransaction,
  actorId: string,
  actorSessionVersion: number,
  targetId: string
): Promise<AdminAttempt> {
  // Who can inherit is only known from the trips, but users must be locked before trips, in ID order (AD-2). So read
  // once unlocked to learn the likely set, lock it, and read again under the locks; a member who joined in between
  // sends the caller around again with the wider set.
  const likelyMembers = await selectMembers(
    transaction,
    (await selectOwnedTrips(transaction, targetId)).map((trip) => trip.id)
  );
  const scope = await lockAppAndUsersForUpdate(transaction, [
    actorId,
    targetId,
    ...likelyMembers.flatMap((member) => (member.userId ? [member.userId] : [])),
  ]);
  if (!scope.appLocked) return { kind: "refused", reason: AdminDeletionFailure.AppUnavailable };
  if (!scope.lockedUserIds.has(actorId)) return { kind: "refused", reason: AdminDeletionFailure.Forbidden };
  if (!scope.lockedUserIds.has(targetId)) return { kind: "refused", reason: AdminDeletionFailure.Changed };

  const accounts = await transaction
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      passwordHash: users.passwordHash,
      sessionVersion: users.sessionVersion,
    })
    .from(users)
    .where(inArray(users.id, [actorId, targetId]));
  const actor = accounts.find((account) => account.id === actorId);
  const target = accounts.find((account) => account.id === targetId);
  const actorAuthorized =
    actor?.role === UserRole.Admin && actor.passwordHash !== null && actor.sessionVersion === actorSessionVersion;
  if (!actor || !actorAuthorized) return { kind: "refused", reason: AdminDeletionFailure.Forbidden };
  if (!target) return { kind: "refused", reason: AdminDeletionFailure.Changed };

  const setupComplete = target.passwordHash !== null;
  // Only a completed admin counts toward the guard, so an unfinished admin leaving never strands the app.
  if (target.role === UserRole.Admin && setupComplete) {
    try {
      await assertAnotherCompletedAdmin(transaction, targetId);
    } catch (error) {
      if (error instanceof LastCompletedAdminError) return { kind: "refused", reason: AdminDeletionFailure.LastAdmin };
      throw error;
    }
  }

  const ownedTrips = (await selectOwnedTrips(transaction, targetId)).sort((left, right) =>
    compareText(left.id, right.id)
  );
  try {
    for (const trip of ownedTrips) await lockTripForUpdate(transaction, trip.id);
  } catch (error) {
    if (error instanceof Error && error.message === TRIP_NOT_FOUND_MESSAGE) return { kind: "widened" };
    throw error;
  }
  const members = await selectMembers(
    transaction,
    ownedTrips.map((trip) => trip.id)
  );
  if (members.some((member) => member.userId && !scope.lockedUserIds.has(member.userId))) return { kind: "widened" };

  const outcomes: TripOutcome[] = ownedTrips.map((trip) => ({
    trip,
    successorUserId: pickSuccessor(
      members.filter((member) => member.tripId === trip.id),
      targetId
    ),
  }));
  const heirs = outcomes.flatMap((outcome) =>
    outcome.successorUserId ? [[outcome.trip.id, outcome.successorUserId] as const] : []
  );
  return {
    kind: "resolved",
    actor: { id: actor.id, username: actor.username },
    preview: {
      userId: targetId,
      username: target.username,
      setupComplete,
      transferredTripCount: heirs.length,
      deletedTripCount: outcomes.length - heirs.length,
      fingerprint: outcomeFingerprint(targetId, setupComplete, outcomes),
    },
    removal: {
      account: { id: targetId, username: target.username },
      ownedTrips,
      members,
      heirByTripId: new Map(heirs),
      clearCreators: true,
    },
  };
}

type AdminDeletionRun =
  | { ok: false; reason: AdminDeletionFailure }
  | { ok: true; preview: AdminDeletionPreview; deleted?: { summary: DeletedAccountSummary; actor: ActivityIdentity } };

/**
 * Preview and commit share this resolver. It locks (singleton, users by ID, trips by ID), rechecks that the actor is
 * still a completed admin on the current session, and recomputes the outcomes. `fingerprint` set means commit: the
 * writes happen only when it matches what was just recomputed, otherwise the fresh preview comes back unwritten.
 * Never persists preview state.
 */
async function runAdminDeletion(
  database: AccountDeletionDatabase,
  actor: AdminActor,
  targetUserId: string,
  fingerprint: string | undefined
): Promise<AdminDeletionRun> {
  if (!UUID_PATTERN.test(actor.id) || actor.sessionVersion === undefined) {
    return { ok: false, reason: AdminDeletionFailure.Forbidden };
  }
  if (!UUID_PATTERN.test(targetUserId)) return { ok: false, reason: AdminDeletionFailure.Changed };
  const actorId = actor.id.toLowerCase();
  const actorSessionVersion = actor.sessionVersion;
  const targetId = targetUserId.toLowerCase();

  try {
    for (let attempt = 0; attempt < MAX_LOCK_ATTEMPTS; attempt++) {
      const run = await database.transaction(async (transaction): Promise<AdminDeletionRun | undefined> => {
        const resolved = await lockAndResolve(transaction, actorId, actorSessionVersion, targetId);
        if (resolved.kind === "widened") return undefined;
        if (resolved.kind === "refused") return { ok: false, reason: resolved.reason };
        if (fingerprint === undefined || !fingerprintMatches(resolved.preview.fingerprint, fingerprint)) {
          return { ok: true, preview: resolved.preview };
        }
        const summary = await removeAccount(transaction, resolved.removal);
        return { ok: true, preview: resolved.preview, deleted: { summary, actor: resolved.actor } };
      });
      if (run) return run;
    }
    return { ok: false, reason: AdminDeletionFailure.Retry };
  } catch (error) {
    if (retryable(error)) return { ok: false, reason: AdminDeletionFailure.Retry };
    throw error;
  }
}

/** What deleting the account would do, as counts and an opaque fingerprint only. Writes nothing. */
export async function previewAccountDeletionAsAdmin(
  database: AccountDeletionDatabase,
  actor: AdminActor,
  targetUserId: string
): Promise<AdminDeletionPreviewResult> {
  const run = await runAdminDeletion(database, actor, targetUserId, undefined);
  return run.ok ? { ok: true, preview: run.preview } : run;
}

/**
 * Deletes a pending or completed account for an admin, transferring each trip it owns to its earliest eligible
 * manager or editor (or deleting the trip), but only if `fingerprint` still matches the outcomes under the locks.
 * Events, file cleanup and sign-out belong to the caller.
 */
export async function deleteAccountAsAdmin(
  database: AccountDeletionDatabase,
  actor: AdminActor,
  targetUserId: string,
  fingerprint: string
): Promise<AdminDeletionOutcome> {
  const run = await runAdminDeletion(database, actor, targetUserId, fingerprint);
  if (!run.ok) return run;
  if (!run.deleted) return { ok: false, reason: AdminDeletionFailure.Changed, preview: run.preview };
  return { ok: true, ...run.deleted, setupComplete: run.preview.setupComplete };
}
