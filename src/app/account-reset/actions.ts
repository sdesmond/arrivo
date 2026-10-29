"use server";

import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { ActivityEventType, type PasswordResetActionState } from "@/data/types";
import { recordActivity } from "@/lib/activity";
import { completePasswordReset } from "@/lib/password-reset";
import {
  PASSWORD_RESET_COOKIE,
  PASSWORD_RESET_COOKIE_PATH,
  resolvePasswordResetContext,
} from "@/lib/password-reset-session";
import { PASSWORD_BCRYPT_COST, failedPasswordField, validateNewPassword } from "@/lib/password-policy";
import { isHttpsRequest } from "@/lib/request-origin";

async function clearCookie() {
  (await cookies()).set(PASSWORD_RESET_COOKIE, "", {
    path: PASSWORD_RESET_COOKIE_PATH,
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: isHttpsRequest(await headers()),
  });
}
async function unavailable(): Promise<never> {
  await clearCookie();
  return redirect("/account-reset");
}

export async function completePasswordResetAction(
  _previous: PasswordResetActionState,
  form: FormData
): Promise<PasswordResetActionState> {
  const password = String(form.get("password") ?? "");
  const confirmation = String(form.get("confirmPassword") ?? "");
  const error = validateNewPassword(password, confirmation);
  if (error) return { error, field: failedPasswordField(password) };
  const token = (await cookies()).get(PASSWORD_RESET_COOKIE)?.value;
  const context = await resolvePasswordResetContext(token, { headers: await headers(), countAttempt: true });
  if (!token || context.status !== "ready") return unavailable();
  const passwordHash = await bcrypt.hash(password, PASSWORD_BCRYPT_COST);
  const outcome = await completePasswordReset(db, { token, passwordHash });
  if (!outcome.ok) {
    if (outcome.reason === "retry") return { error: "Something went wrong. Try again.", field: "password" };
    return unavailable();
  }
  await clearCookie();
  recordActivity({
    type: ActivityEventType.PasswordResetCompleted,
    actor: { id: outcome.userId, username: outcome.username },
  });
  redirect("/sign-in");
}
