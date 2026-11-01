"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, signIn, signOut } from "@/auth";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { db } from "@/db";
import {
  ActivityEventType,
  type ActivityIdentity,
  type SignInActionState,
  type AccountSetupActionState,
} from "@/data/types";
import { recordActivity } from "@/lib/activity";
import { completeAccountSetup } from "@/lib/account-setup-completion";
import {
  ACCOUNT_SETUP_COOKIE,
  ACCOUNT_SETUP_COOKIE_PATH,
  resolveAccountSetupContext,
} from "@/lib/account-setup-session";
import { PASSWORD_BCRYPT_COST, failedPasswordField, validateNewPassword } from "@/lib/password-policy";
import { isHttpsRequest } from "@/lib/request-origin";

async function clearSetupCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(ACCOUNT_SETUP_COOKIE, "", {
    path: ACCOUNT_SETUP_COOKIE_PATH,
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: isHttpsRequest(await headers()),
  });
}

// An unusable link is the generic unavailable page: nothing was saved, and the stale cookie is dropped on the way.
async function unavailable(): Promise<never> {
  await clearSetupCookie();
  return redirect("/account-setup");
}

export async function completeAccountSetupAction(
  _prev: AccountSetupActionState,
  formData: FormData
): Promise<AccountSetupActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  // Validation first: a bad form costs no database work and no bcrypt, and leaves the link untouched.
  if (!name) return { error: "Name is required.", field: "name", name };
  const passwordError = validateNewPassword(password, confirmPassword);
  if (passwordError) return { error: passwordError, field: failedPasswordField(password), name };

  const token = (await cookies()).get(ACCOUNT_SETUP_COOKIE)?.value;
  const context = await resolveAccountSetupContext(token, { headers: await headers() });
  if (context.status !== "ready" || !token) return unavailable();

  const userId = (await auth())?.user?.id;
  if (userId && userId !== context.account.userId) return redirect("/account-setup");

  const passwordHash = await bcrypt.hash(password, PASSWORD_BCRYPT_COST);
  const completion = await completeAccountSetup(db, { token, name, passwordHash });
  if (!completion.ok) {
    if (completion.reason === "retry") {
      return { error: "Something went wrong. Try again.", field: "password", name };
    }
    return unavailable();
  }

  // Committed. Identities only: never the token, link or password.
  await clearSetupCookie();
  recordActivity({
    type: ActivityEventType.SetupCompleted,
    actor: { id: completion.userId, username: completion.username },
  });

  const signInFormData = new FormData();
  signInFormData.set("username", completion.username);
  signInFormData.set("password", password);
  signInFormData.set("redirectTo", "/trips");
  signInFormData.set("keepSignedIn", "true");
  try {
    await signIn("credentials", signInFormData);
  } catch (error) {
    // The account is finished; a refused sign-in only means the person signs in themselves.
    if (error instanceof AuthError) return redirect("/sign-in");
    throw error;
  }
  return undefined;
}

// Match ordinary auth sign-out: identity lookup is best effort and never blocks logout.
async function currentIdentity(): Promise<ActivityIdentity | null | undefined> {
  try {
    const userId = (await auth())?.user?.id;
    if (!userId) return undefined;
    const [row] = await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, userId));
    return row ?? null;
  } catch {
    return null;
  }
}

export async function signOutAndContinueSetupAction(
  _prev: SignInActionState,
  _formData: FormData
): Promise<SignInActionState> {
  // Confirmation carries no setup identity or token from the browser.
  void _formData;
  const token = (await cookies()).get(ACCOUNT_SETUP_COOKIE)?.value;
  const context = await resolveAccountSetupContext(token, { headers: await headers() });
  if (!token || context.status !== "ready") return unavailable();

  const identity = await currentIdentity();
  try {
    await signOut({ redirect: false });
  } catch {
    return { error: "Could not sign out. Try again." };
  }
  if (identity !== undefined) recordActivity({ type: ActivityEventType.SignOut, actor: identity });
  // Preserve the setup cookie and original expiry. The destination resolves database state again.
  redirect("/account-setup");
}
