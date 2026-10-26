"use server";

import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/db";
import { users, userLoyaltyNumbers, userWishlistDestinations, userCompanions } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import bcrypt from "bcryptjs";
import {
  AccountDeletionFailure,
  ActivityEventType,
  CoverType,
  LiveSyncEventType,
  SignInNotice,
  TransitMode,
} from "@/data/types";
import { recordActivity } from "@/lib/activity";
import { lockUserForUpdate } from "@/lib/server-action-locks";
import { deleteOwnAccount } from "@/lib/account-deletion";
import { publishInvitationChanged } from "@/lib/invitations";
import { isUniqueViolation } from "@/lib/error-utils";
import { normalizeUsername, validateUsername } from "@/lib/username";
import { getStorageAdapter } from "@/lib/storage/storage-adapter";
import { publishTripEvent, publishUserEvent, purgeTripTopic } from "@/lib/trip-events";
import { encryptOptionalField, isFieldEncryptionConfigured } from "@/lib/field-encryption";
import { accountTarget, checkThrottle, clearFailures, lockoutMessage, recordFailure } from "@/lib/auth-throttle";
import { bumpSessionVersion } from "@/lib/session-version";
import type {
  UpdateUserProfilePatch,
  AddLoyaltyNumberInput,
  AddWishlistDestinationInput,
  AddCompanionInput,
  UpdateCompanionPatch,
  DeleteAccountResult,
  TripDeletionChoice,
} from "@/data/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COMPANION_LIMIT_EXCEEDED = "CAP_EXCEEDED";
const TRAVEL_DOCUMENTS_NEED_KEY = "Saving travel documents needs DATA_ENCRYPTION_KEY set on the server.";

// Passport and Known Traveler Numbers are stored encrypted; clearing them (null/"") needs no key.
function travelDocumentsNeedKey(patch: { passportNumber?: string | null; knownTravelerNumber?: string | null }) {
  return !!(patch.passportNumber || patch.knownTravelerNumber) && !isFieldEncryptionConfigured();
}

export async function updateProfile(patch: UpdateUserProfilePatch): Promise<{ error?: string }> {
  const session = await requireUser();

  // Trim name and validate the trimmed value; normalize empty string to null
  const trimmedName = patch.name !== undefined ? patch.name.trim() : undefined;
  if (trimmedName !== undefined && trimmedName.length > 100) {
    return { error: "Name must be 100 characters or fewer." };
  }
  const usernameError = patch.username !== undefined ? validateUsername(patch.username) : null;
  if (usernameError) return { error: usernameError };
  if (patch.passportNumber !== undefined && patch.passportNumber !== null) {
    if (patch.passportNumber.length > 20) return { error: "Passport number must be 20 characters or fewer." };
  }
  if (patch.passportNationality !== undefined && patch.passportNationality !== null) {
    if (patch.passportNationality.length > 50) return { error: "Nationality must be 50 characters or fewer." };
  }
  if (patch.knownTravelerNumber !== undefined && patch.knownTravelerNumber !== null) {
    if (patch.knownTravelerNumber.length > 20)
      return { error: "Known traveler number must be 20 characters or fewer." };
  }
  if (patch.currency !== undefined && patch.currency !== "") {
    if (!/^[A-Z]{3}$/.test(patch.currency)) return { error: "Currency must be a 3-letter ISO code." };
  }
  if (patch.dateFormat !== undefined) {
    if (!["MM/DD/YYYY", "DD/MM/YYYY"].includes(patch.dateFormat)) return { error: "Invalid date format." };
  }
  if (patch.distanceUnit !== undefined) {
    if (!["imperial", "metric"].includes(patch.distanceUnit)) return { error: "Invalid distance unit." };
  }
  if (patch.transitMode !== undefined && patch.transitMode !== null) {
    const validModes = Object.values(TransitMode) as string[];
    if (!validModes.includes(patch.transitMode)) {
      return { error: "Invalid transit mode." };
    }
  }
  if (patch.walkThresholdMeters !== undefined && patch.walkThresholdMeters !== null) {
    if (!Number.isInteger(patch.walkThresholdMeters) || patch.walkThresholdMeters <= 0) {
      return { error: "Walk threshold must be a positive integer." };
    }
    if (patch.walkThresholdMeters > 5000) {
      return { error: "Walk threshold must be 5000 meters or less." };
    }
  }
  if (patch.defaultCoverType !== undefined) {
    const validCoverTypes = Object.values(CoverType) as string[];
    if (!validCoverTypes.includes(patch.defaultCoverType)) {
      return { error: "Invalid cover type." };
    }
  }
  if (patch.passportExpiry !== undefined && !DATE_RE.test(patch.passportExpiry)) {
    return { error: "Passport expiry must be a valid date (YYYY-MM-DD)." };
  }
  if (patch.warningThreshold !== undefined && (patch.warningThreshold < 0 || patch.warningThreshold > 100)) {
    return { error: "Warning threshold must be between 0 and 100." };
  }
  if (patch.dangerThreshold !== undefined && (patch.dangerThreshold < 0 || patch.dangerThreshold > 100)) {
    return { error: "Danger threshold must be between 0 and 100." };
  }
  if (patch.warningThreshold !== undefined || patch.dangerThreshold !== undefined) {
    const effectiveWarning = patch.warningThreshold ?? 80;
    const effectiveDanger = patch.dangerThreshold ?? 90;
    if (effectiveWarning >= effectiveDanger) {
      return { error: "Warning threshold must be less than danger threshold." };
    }
  }

  if (travelDocumentsNeedKey(patch)) return { error: TRAVEL_DOCUMENTS_NEED_KEY };

  const dbPatch: Omit<UpdateUserProfilePatch, "name"> & { name?: string | null } = { ...patch };
  if (trimmedName !== undefined) dbPatch.name = trimmedName || null;
  if (patch.username !== undefined) dbPatch.username = normalizeUsername(patch.username);
  if (patch.passportNumber !== undefined) dbPatch.passportNumber = encryptOptionalField(patch.passportNumber);
  if (patch.knownTravelerNumber !== undefined) {
    dbPatch.knownTravelerNumber = encryptOptionalField(patch.knownTravelerNumber);
  }

  // A username change needs the row's old username and proof the value really changed, so it is locked, read and
  // updated in one transaction. Other edits keep the plain update.
  let renamedFrom: string | undefined;
  try {
    if (dbPatch.username !== undefined) {
      const newUsername = dbPatch.username;
      renamedFrom = await db.transaction(async (transaction) => {
        await lockUserForUpdate(transaction, session.id!);
        const [current] = await transaction
          .select({ username: users.username })
          .from(users)
          .where(eq(users.id, session.id!));
        await transaction.update(users).set(dbPatch).where(eq(users.id, session.id!));
        return current && current.username !== newUsername ? current.username : undefined;
      });
    } else {
      await db.update(users).set(dbPatch).where(eq(users.id, session.id!));
    }
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "That username is taken." };
    return { error: "Something went wrong." };
  }
  // After commit, with the pre-change username and the stable ID; the new value is deliberately not stored.
  if (renamedFrom !== undefined) {
    recordActivity({
      type: ActivityEventType.UsernameChanged,
      actor: { id: session.id!, username: renamedFrom },
    });
  }
  revalidatePath("/profile");
  revalidatePath("/trips");
  return {};
}

export async function addLoyaltyNumber(input: AddLoyaltyNumberInput): Promise<void> {
  const session = await requireUser();
  if (input.programName.length > 100) throw new Error("Program name must be 100 characters or fewer.");
  if (input.memberNumber.length > 50) throw new Error("Member number must be 50 characters or fewer.");
  const userId = session.id!;
  await db.transaction(async (transaction) => {
    await lockUserForUpdate(transaction, userId);

    const [{ nextPos }] = await transaction
      .select({ nextPos: sql<number>`coalesce(max(${userLoyaltyNumbers.position}), -1) + 1` })
      .from(userLoyaltyNumbers)
      .where(eq(userLoyaltyNumbers.userId, userId));
    await transaction.insert(userLoyaltyNumbers).values({
      userId,
      programName: input.programName,
      memberNumber: input.memberNumber,
      position: nextPos,
    });
  });
  revalidatePath("/profile");
}

export async function deleteLoyaltyNumber(id: string): Promise<void> {
  const session = await requireUser();
  await db
    .delete(userLoyaltyNumbers)
    .where(and(eq(userLoyaltyNumbers.id, id), eq(userLoyaltyNumbers.userId, session.id!)));
  revalidatePath("/profile");
}

export async function addWishlistDestination(input: AddWishlistDestinationInput): Promise<void> {
  const session = await requireUser();
  if (input.name.length > 100) throw new Error("Destination name must be 100 characters or fewer.");
  const userId = session.id!;
  await db.transaction(async (transaction) => {
    await lockUserForUpdate(transaction, userId);

    const [{ nextPos }] = await transaction
      .select({ nextPos: sql<number>`coalesce(max(${userWishlistDestinations.position}), -1) + 1` })
      .from(userWishlistDestinations)
      .where(eq(userWishlistDestinations.userId, userId));
    await transaction.insert(userWishlistDestinations).values({ userId, name: input.name, position: nextPos });
  });
  revalidatePath("/profile");
}

export async function deleteWishlistDestination(id: string): Promise<void> {
  const session = await requireUser();
  await db
    .delete(userWishlistDestinations)
    .where(and(eq(userWishlistDestinations.id, id), eq(userWishlistDestinations.userId, session.id!)));
  revalidatePath("/profile");
}

export async function changePassword({
  currentPassword,
  newPassword,
}: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ error?: string }> {
  const session = await requireUser();
  const userId = session.id!;
  const throttleTargets = [accountTarget("pwchange", userId)];

  const throttle = await checkThrottle(throttleTargets);
  if (throttle.locked) return { error: lockoutMessage(throttle.retryAfterSeconds) };

  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId));

  if (!user?.passwordHash) return { error: "No password set on this account." };

  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) {
    await recordFailure(throttleTargets);
    return { error: "Current password is incorrect." };
  }
  await clearFailures(throttleTargets);

  if (newPassword.length < 8) return { error: "New password must be at least 8 characters." };

  const hash = await bcrypt.hash(newPassword, 10);
  let updated: { username: string }[];
  try {
    updated = await db
      .update(users)
      .set({ passwordHash: hash })
      .where(eq(users.id, userId))
      .returning({ username: users.username });
  } catch {
    return { error: "Something went wrong." };
  }

  // Anyone holding a session from before the change (including whoever learned the old password) is out.
  await bumpSessionVersion(userId);
  // Recorded before sign-out, whose redirect ends this action. No logout event: the revocation is part of this one.
  if (updated[0]) {
    recordActivity({
      type: ActivityEventType.PassChanged,
      actor: { id: userId, username: updated[0].username },
    });
  }
  await signOut({ redirectTo: `/sign-in?notice=${SignInNotice.PasswordChanged}` });
  return {};
}

export async function addCompanion(input: AddCompanionInput): Promise<{ error?: string }> {
  const session = await requireUser();
  const userId = session.id!;

  const trimmedName = input.name?.trim() ?? "";
  if (!trimmedName) return { error: "Companion name is required." };
  if (trimmedName.length > 50) return { error: "Companion name must be 50 characters or fewer." };

  try {
    await db.transaction(async (transaction) => {
      await lockUserForUpdate(transaction, userId);

      const [{ count }] = await transaction
        .select({ count: sql<number>`count(*)::int` })
        .from(userCompanions)
        .where(eq(userCompanions.userId, userId));
      if (count >= 20) {
        throw new Error(COMPANION_LIMIT_EXCEEDED);
      }

      const [{ nextPos }] = await transaction
        .select({ nextPos: sql<number>`coalesce(max(${userCompanions.position}), -1) + 1` })
        .from(userCompanions)
        .where(eq(userCompanions.userId, userId));

      await transaction.insert(userCompanions).values({
        userId,
        name: trimmedName,
        age: input.age ?? null,
        position: nextPos,
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === COMPANION_LIMIT_EXCEEDED) {
      return { error: "Companion limit reached (20 maximum)." };
    }
    return { error: "Something went wrong." };
  }
  revalidatePath("/profile");
  return {};
}

export async function updateCompanion(id: string, patch: UpdateCompanionPatch): Promise<{ error?: string }> {
  const session = await requireUser();

  const trimmedName = patch.name !== undefined ? patch.name.trim() : undefined;
  if (trimmedName !== undefined) {
    if (!trimmedName) return { error: "Companion name is required." };
    if (trimmedName.length > 50) return { error: "Companion name must be 50 characters or fewer." };
  }
  if (patch.age !== undefined && patch.age !== null) {
    if (!Number.isInteger(patch.age) || patch.age < 0 || patch.age > 120) {
      return { error: "Age must be between 0 and 120." };
    }
  }
  if (patch.passportExpiry !== undefined && !DATE_RE.test(patch.passportExpiry)) {
    return { error: "Passport expiry must be a valid date (YYYY-MM-DD)." };
  }

  if (travelDocumentsNeedKey(patch)) return { error: TRAVEL_DOCUMENTS_NEED_KEY };

  let updated: { id: string }[];
  try {
    updated = await db
      .update(userCompanions)
      .set({
        name: trimmedName,
        age: patch.age ?? null,
        passportNumber: encryptOptionalField(patch.passportNumber) ?? null,
        passportExpiry: patch.passportExpiry ?? null,
        passportNationality: patch.passportNationality ?? null,
        knownTravelerNumber: encryptOptionalField(patch.knownTravelerNumber) ?? null,
        username: patch.username ?? null,
      })
      .where(and(eq(userCompanions.id, id), eq(userCompanions.userId, session.id!)))
      .returning({ id: userCompanions.id });
  } catch {
    return { error: "Something went wrong." };
  }
  if (updated.length === 0) return { error: "Companion not found." };
  revalidatePath("/profile");
  return {};
}

export async function deleteCompanion(id: string): Promise<void> {
  const session = await requireUser();
  await db.delete(userCompanions).where(and(eq(userCompanions.id, id), eq(userCompanions.userId, session.id!)));
  revalidatePath("/profile");
}

const ACCOUNT_DELETION_STALE_MESSAGE = "Your shared trips changed. Review them and try again.";
const LAST_ADMIN_MESSAGE =
  "You're the only admin with a finished account. Make another account an admin before deleting yours.";

/**
 * Deletes the signed-in user's account; the transaction, trip handoff and last-admin guard live in
 * `deleteOwnAccount`. Events, file cleanup and sign-out run here, only after it commits.
 */
export async function deleteAccount(choices: TripDeletionChoice[]): Promise<DeleteAccountResult> {
  const session = await requireUser();
  const userId = session.id!;
  const staleResult: DeleteAccountResult = { status: "error", message: ACCOUNT_DELETION_STALE_MESSAGE, stale: true };
  if (!Array.isArray(choices)) return staleResult;

  const result = await deleteOwnAccount(db, userId, choices);
  if (!result.ok) {
    return result.reason === AccountDeletionFailure.Stale
      ? staleResult
      : { status: "error", message: LAST_ADMIN_MESSAGE };
  }
  const deletion = result.summary;
  // Committed. Recorded before cleanup, which can fail or be interrupted; no logout event for the implied sign-out.
  recordActivity({ type: ActivityEventType.AccountDeleted, actor: deletion.account });

  for (const invitation of deletion.rescindedInvitations) {
    publishInvitationChanged(invitation.inviteeId, invitation.tripId);
  }
  for (const tripId of deletion.deletedTripIds) {
    publishTripEvent(tripId, { type: LiveSyncEventType.TripDeleted, tripId });
  }
  // Members watching their dashboard only hold their personal channel, mirroring deleteTrip.
  for (const member of deletion.deletedTripMembers) {
    publishUserEvent(member.userId, { type: LiveSyncEventType.TripDeleted, tripId: member.tripId });
  }
  for (const tripId of deletion.deletedTripIds) {
    purgeTripTopic(tripId);
  }
  for (const tripId of new Set(deletion.remainingTripIds)) {
    publishTripEvent(tripId, { type: LiveSyncEventType.MembershipChanged, tripId });
  }
  // The new owner's role changed; their other sessions only listen on their personal channel.
  for (const [tripId, heirUserId] of deletion.transferredTrips) {
    publishUserEvent(heirUserId, { type: LiveSyncEventType.MembershipChanged, tripId });
  }

  // Best-effort: a file that won't delete must not undo or block the account deletion.
  await Promise.all(
    deletion.storageUrls.map((url) =>
      getStorageAdapter()
        .del(url)
        .catch((error) => console.warn(`Cleanup failed for ${url}`, error))
    )
  );

  revalidatePath("/trips");
  await signOut({ redirectTo: "/sign-in" });
  return { status: "success" };
}
