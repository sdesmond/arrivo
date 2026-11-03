"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import type { PasswordPolicyReadResult, PasswordPolicySaveResult } from "@/data/types";
import { requireUser } from "@/lib/auth-helpers";
import { readPasswordPolicyForAdmin, savePasswordPolicy } from "@/lib/password-policy-store";

/**
 * Both arguments come off the wire, so the store validates them. It rechecks completed-admin authority under the
 * app lock; this action only needs to know who is asking. Failures come back as a status, never as a message from
 * the database.
 */
export async function savePasswordPolicySettings(
  policy: unknown,
  expectedPolicy: unknown
): Promise<PasswordPolicySaveResult> {
  const user = await requireUser();
  let result;
  try {
    result = await savePasswordPolicy(db, user.id!, policy, expectedPolicy);
  } catch {
    return { status: "unavailable" };
  }
  if (result.status !== "ok") return result;
  // Revalidation failure cannot turn a committed save into a claimed failure.
  try {
    revalidatePath("/admin/security");
  } catch {
    /* The next request reads the committed rules. */
  }
  return { status: "ok", policy: result.policy };
}

/** The saved rules as the server sees them now, for an admin whose save was refused as stale. */
export async function refreshPasswordPolicy(): Promise<PasswordPolicyReadResult> {
  const user = await requireUser();
  try {
    return await readPasswordPolicyForAdmin(db, user.id!);
  } catch {
    return { status: "unavailable" };
  }
}
