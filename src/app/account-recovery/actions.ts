"use server";

import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { ActivityEventType, type AdminRecoveryActionState } from "@/data/types";
import { recordActivity } from "@/lib/activity";
import { completeAdminRecovery } from "@/lib/admin-recovery-completion";
import {
  ADMIN_RECOVERY_COOKIE,
  ADMIN_RECOVERY_COOKIE_PATH,
  resolveAdminRecoveryContext,
} from "@/lib/admin-recovery-session";
import { PASSWORD_BCRYPT_COST, failedPasswordField, validateNewPassword } from "@/lib/password-policy";
import { isHttpsRequest } from "@/lib/request-origin";

const CODE_ERROR = "That code didn't work. Check your authenticator app and try again.";

async function clearCookie() {
  (await cookies()).set(ADMIN_RECOVERY_COOKIE, "", {
    path: ADMIN_RECOVERY_COOKIE_PATH,
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: isHttpsRequest(await headers()),
  });
}
async function unavailable(): Promise<never> {
  await clearCookie();
  return redirect("/account-recovery");
}

/**
 * Success returns the recovery codes to the form instead of redirecting, because they are shown once. The cookie is
 * left alone on success: setting it here would re-render the page under the form and drop the codes. The link is
 * already consumed, so the leftover cookie is inert.
 */
export async function completeAdminRecoveryAction(
  _previous: AdminRecoveryActionState,
  form: FormData
): Promise<AdminRecoveryActionState> {
  const password = String(form.get("password") ?? "");
  const confirmation = String(form.get("confirmPassword") ?? "");
  const passwordError = validateNewPassword(password, confirmation);
  if (passwordError) return { error: passwordError, field: failedPasswordField(password) };
  const code = String(form.get("code") ?? "");
  if (!/^\d{6}$/.test(code.replace(/\s/g, ""))) return { error: CODE_ERROR, field: "code" };

  const token = (await cookies()).get(ADMIN_RECOVERY_COOKIE)?.value;
  const context = await resolveAdminRecoveryContext(token, { headers: await headers(), attempt: "submit" });
  if (!token || context.status !== "ready") return unavailable();

  const passwordHash = await bcrypt.hash(password, PASSWORD_BCRYPT_COST);
  const outcome = await completeAdminRecovery(db, { token, passwordHash, code });
  if (!outcome.ok) {
    if (outcome.reason === "retry") return { error: "Something went wrong. Try again.", field: "password" };
    if (outcome.reason === "invalid-code") return { error: CODE_ERROR, field: "code" };
    return unavailable();
  }
  recordActivity({
    type: ActivityEventType.AdminRecoveryCompleted,
    actor: { id: outcome.userId, username: outcome.username },
  });
  return { recoveryCodes: outcome.recoveryCodes };
}
