"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  ActivityEventType,
  AddUserFailure,
  type AddUserResult,
  type ChangeUserRoleResult,
  type UserRole,
  type RegenerateSetupLinkResult,
  type SetupLinkTargetState,
} from "@/data/types";
import { recordActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/auth-helpers";
import { addUser } from "@/lib/account-creation";
import { changeUserRole } from "@/lib/account-role-changes";
import { trustedLinkOrigin } from "@/lib/request-origin";
import { listInstanceUsers } from "@/lib/instance-users";
import { normalizeUsername } from "@/lib/username";
import { regenerateSetupLink } from "@/lib/setup-link-regeneration";

export async function checkSetupLinkTargetAction(targetUserId: string): Promise<SetupLinkTargetState> {
  await requireAdmin();
  const target = (await listInstanceUsers()).find((user) => user.id === targetUserId);
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
    setupUrl: `${origin}/account-setup/open?token=${encodeURIComponent(outcome.token)}`,
  };
}

export async function checkAddedUserAction(username: string): Promise<boolean> {
  await requireAdmin();
  const normalized = normalizeUsername(username);
  const users = await listInstanceUsers();
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
  const setupUrl = `${origin}/account-setup/open?token=${encodeURIComponent(outcome.token)}`;
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
