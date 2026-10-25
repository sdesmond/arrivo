"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import type { ChangeUserRoleResult, UserRole } from "@/data/types";
import { requireAdmin } from "@/lib/auth-helpers";
import { changeUserRole } from "@/lib/account-role-changes";

export async function changeUserRoleAction(targetUserId: string, role: UserRole): Promise<ChangeUserRoleResult> {
  const user = await requireAdmin();
  const result = await changeUserRole(db, user.id!, { targetUserId, role });
  if (result.ok) revalidatePath("/admin/users");
  return result;
}
