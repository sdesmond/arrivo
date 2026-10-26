"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { ActivityEventType, type ChangeUserRoleResult, type UserRole } from "@/data/types";
import { recordActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/auth-helpers";
import { changeUserRole } from "@/lib/account-role-changes";

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
