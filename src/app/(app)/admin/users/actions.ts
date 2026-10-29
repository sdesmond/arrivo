"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  ActivityEventType,
  AddUserFailure,
  type AddUserResult,
  type ChangeUserRoleResult,
  AdminDeletionFailure,
  type AdminDeletionPreviewResult,
  type DeleteAccountAsAdminResult,
  type UserRole,
  type RegenerateSetupLinkResult,
  type SetupLinkTargetState,
  type PasswordResetLinkResult,
} from "@/data/types";
import { recordActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/auth-helpers";
import { addUser } from "@/lib/account-creation";
import { changeUserRole } from "@/lib/account-role-changes";
import { trustedLinkOrigin } from "@/lib/request-origin";
import { listAppUsers } from "@/lib/app-users";
import { normalizeUsername } from "@/lib/username";
import { regenerateSetupLink } from "@/lib/setup-link-regeneration";
import { deleteAccountAsAdmin, previewAccountDeletionAsAdmin } from "@/lib/account-deletion";
import { runAccountDeletionEffects } from "@/lib/account-deletion-effects";
import { signOut } from "@/auth";
import { issuePasswordReset } from "@/lib/password-reset-issuance";

export async function issuePasswordResetAction(targetUserId: string): Promise<PasswordResetLinkResult> {
  const user = await requireAdmin();
  const origin = trustedLinkOrigin();
  if (!origin) return { ok: false, reason: "origin-unavailable", message: ORIGIN_UNAVAILABLE_MESSAGE };
  const outcome = await issuePasswordReset(db, user.id!, targetUserId, user.sessionVersion);
  if (!outcome.ok) return outcome;
  recordActivity({
    type: ActivityEventType.PasswordResetLinkGenerated,
    actor: outcome.actor,
    target: { id: outcome.userId, username: outcome.username },
  });
  return {
    ok: true,
    userId: outcome.userId,
    username: outcome.username,
    expiresAt: outcome.expiresAt,
    resetUrl: `${origin}/account-reset/open?token=${encodeURIComponent(outcome.token)}`,
  };
}

function setupUrlFor(origin: string, token: string): string {
  return `${origin}/account-setup/open?token=${encodeURIComponent(token)}`;
}

export async function checkSetupLinkTargetAction(targetUserId: string): Promise<SetupLinkTargetState> {
  await requireAdmin();
  const target = (await listAppUsers()).find((user) => user.id === targetUserId);
  return {
    userId: targetUserId,
    state: !target ? "missing" : target.setupComplete ? "completed" : "unfinished",
    ...(!target?.setupComplete && target?.setupExpiresAt ? { setupExpiresAt: target.setupExpiresAt } : {}),
  };
}

export async function regenerateSetupLinkAction(targetUserId: string): Promise<RegenerateSetupLinkResult> {
  const user = await requireAdmin();
  const origin = trustedLinkOrigin();
  if (!origin) return { ok: false, reason: "origin-unavailable", message: ORIGIN_UNAVAILABLE_MESSAGE };
  const outcome = await regenerateSetupLink(db, user.id!, targetUserId);
  if (!outcome.ok) return outcome;
  revalidatePath("/admin/users");
  recordActivity({
    type: ActivityEventType.SetupLinkRegenerated,
    actor: outcome.actor,
    target: { id: outcome.userId, username: outcome.username },
  });
  return {
    ok: true,
    userId: outcome.userId,
    username: outcome.username,
    expiresAt: outcome.expiresAt,
    setupUrl: setupUrlFor(origin, outcome.token),
  };
}

// A refusal that says the list is out of date: show Users as it now is.
const REFRESHES_USERS: ReadonlySet<AdminDeletionFailure> = new Set([
  AdminDeletionFailure.Forbidden,
  AdminDeletionFailure.Changed,
  AdminDeletionFailure.LastAdmin,
]);

export async function previewAccountDeletionAction(targetUserId: string): Promise<AdminDeletionPreviewResult> {
  const user = await requireAdmin();
  if (typeof targetUserId !== "string") return { ok: false, reason: AdminDeletionFailure.Changed };
  const result = await previewAccountDeletionAsAdmin(
    db,
    { id: user.id!, sessionVersion: user.sessionVersion },
    targetUserId
  );
  if (!result.ok && REFRESHES_USERS.has(result.reason)) revalidatePath("/admin/users");
  return result;
}

/**
 * Deletes a pending or completed account the admin reviewed. `fingerprint` is the opaque value from the preview; the
 * service recomputes it under locks, so anything that moved since review comes back as a new preview instead. Only a
 * committed deletion produces Activity, notifications and file cleanup, and none of their failures can undo it.
 */
export async function deleteAccountAction(
  targetUserId: string,
  fingerprint: string
): Promise<DeleteAccountAsAdminResult> {
  const user = await requireAdmin();
  if (typeof targetUserId !== "string" || typeof fingerprint !== "string") {
    return { ok: false, reason: AdminDeletionFailure.Changed };
  }
  const outcome = await deleteAccountAsAdmin(
    db,
    { id: user.id!, sessionVersion: user.sessionVersion },
    targetUserId,
    fingerprint
  );
  if (!outcome.ok) {
    if (REFRESHES_USERS.has(outcome.reason) && !outcome.preview) revalidatePath("/admin/users");
    return outcome;
  }
  revalidatePath("/admin/users");
  const { account } = outcome.summary;
  // Identities only: what happened to the account's trips stays out of Activity.
  await runAccountDeletionEffects(outcome.summary, {
    type: outcome.setupComplete ? ActivityEventType.AccountDeletedByAdmin : ActivityEventType.PendingAccountDeleted,
    actor: outcome.actor,
    target: account,
  });
  // An admin who deleted their own account has no session left; the redirect ends this action.
  if (account.id === user.id) await signOut({ redirectTo: "/sign-in" });
  return { ok: true, userId: account.id, username: account.username };
}

export async function checkAddedUserAction(username: string): Promise<boolean> {
  await requireAdmin();
  const normalized = normalizeUsername(username);
  const users = await listAppUsers();
  return users.some((user) => user.username === normalized);
}

const ORIGIN_UNAVAILABLE_MESSAGE =
  "Setup links need a configured address. Set NEXTAUTH_URL (or AUTH_URL) to the http(s) address people use to reach Arrivo, then restart.";

export async function addUserAction(username: string): Promise<AddUserResult> {
  const user = await requireAdmin();
  // Refuse before the transaction: the link origin is process state, and nothing may be written without it.
  const origin = trustedLinkOrigin();
  if (!origin) return { ok: false, reason: AddUserFailure.OriginUnavailable, message: ORIGIN_UNAVAILABLE_MESSAGE };

  const outcome = await addUser(db, user.id!, { username });
  if (!outcome.ok) return outcome;

  revalidatePath("/admin/users");
  // Identities only: the token and link never reach Activity.
  const target = { id: outcome.userId, username: outcome.username };
  recordActivity({ type: ActivityEventType.AccountCreated, actor: outcome.actor, target });
  recordActivity({ type: ActivityEventType.SetupLinkGenerated, actor: outcome.actor, target });
  const setupUrl = setupUrlFor(origin, outcome.token);
  return { ok: true, userId: outcome.userId, username: outcome.username, setupUrl, expiresAt: outcome.expiresAt };
}

export async function changeUserRoleAction(targetUserId: string, role: UserRole): Promise<ChangeUserRoleResult> {
  const user = await requireAdmin();
  const outcome = await changeUserRole(db, user.id!, { targetUserId, role });
  if (!outcome.ok) return outcome;

  revalidatePath("/admin/users");
  // Only a committed change is history: a no-op to the same role records nothing.
  if (outcome.changed) {
    recordActivity({ type: ActivityEventType.RoleChanged, actor: outcome.actor, target: outcome.target });
  }
  // The usernames are for the event only; the client gets the original result shape.
  return { ok: true, userId: outcome.userId, role: outcome.role, changed: outcome.changed };
}
