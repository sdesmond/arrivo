"use server";

import { auth, signIn, signOut } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { detectPreferredCurrency } from "@/lib/utils";
import { ActivityEventType, type ActivityIdentity, type MfaActionState, type SignInActionState } from "@/data/types";
import { recordActivity } from "@/lib/activity";
import { lockoutMessage } from "@/lib/auth-throttle";
import { LockedOutError, MfaRequiredError } from "@/lib/authorize-credentials";
import { MFA_COOKIE, MFA_TICKET_TTL_MS } from "@/lib/mfa";
import { isHttpsRequest } from "@/lib/request-origin";
import { bootstrapFirstAccount } from "@/lib/instance-bootstrap";
import { isUniqueViolation } from "@/lib/error-utils";
import { normalizeUsername, validateUsername } from "@/lib/username";

type ActionState = { error?: string } | undefined;

export async function signInAction(_prev: SignInActionState, formData: FormData): Promise<SignInActionState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const keepSignedIn = String(formData.get("keepSignedIn") === "on");

  try {
    await signIn("credentials", { username, password, keepSignedIn, redirect: false });
  } catch (err) {
    if (err instanceof MfaRequiredError) {
      (await cookies()).set(MFA_COOKIE, err.ticket, {
        httpOnly: true,
        sameSite: "lax",
        secure: isHttpsRequest(await headers()),
        path: "/",
        maxAge: MFA_TICKET_TTL_MS / 1000,
      });
      return { mfaRequired: true };
    }
    if (err instanceof LockedOutError) return { error: lockoutMessage(err.retryAfterSeconds) };
    if (err instanceof AuthError) return { error: "Invalid username or password." };
    throw err;
  }

  redirect("/trips");
}

export async function verifyMfaAction(_prev: MfaActionState, formData: FormData): Promise<MfaActionState> {
  const cookieJar = await cookies();
  const ticket = cookieJar.get(MFA_COOKIE)?.value;
  if (!ticket) return { error: "Your sign-in timed out. Enter your username and password again.", expired: true };

  try {
    await signIn("credentials", {
      mfaTicket: ticket,
      code: String(formData.get("code") ?? ""),
      remember: String(formData.get("remember") === "on"),
      redirect: false,
    });
  } catch (err) {
    if (err instanceof LockedOutError) return { error: lockoutMessage(err.retryAfterSeconds) };
    if (err instanceof AuthError) return { error: "That code didn't work. Try again." };
    throw err;
  }

  cookieJar.delete(MFA_COOKIE);
  redirect("/trips");
}

export async function setupAdminAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const usernameError = validateUsername(username);
  if (usernameError) return { error: usernameError };
  if (!name) return { error: "Name is required." };
  if (!password || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  if (!confirmPassword) return { error: "Confirm your password." };
  if (password !== confirmPassword) return { error: "Passwords do not match." };

  const acceptLanguage = (await headers()).get("accept-language") ?? "";
  const currency = detectPreferredCurrency(acceptLanguage);
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const result = await bootstrapFirstAccount(db, { username, name, passwordHash, currency });
    if (!result.ok) return { error: "Setup is already complete. Sign in to continue." };
    // Committed; recorded before the auto sign-in so creation precedes that account's first sign-in.
    recordActivity({
      type: ActivityEventType.AccountCreated,
      actor: { id: result.userId, username: result.username },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "That username is taken." };
    throw error;
  }

  const signInFormData = new FormData();
  signInFormData.set("username", username);
  signInFormData.set("password", password);
  signInFormData.set("redirectTo", "/trips");
  // A brand-new account on the browser that created it stays signed in like a ticked "Keep me signed in".
  signInFormData.set("keepSignedIn", "true");

  await signIn("credentials", signInFormData);
}

// Best-effort and read-only: the event needs the stable ID and canonical username, but a lookup failure must never
// block signing out. `undefined` means nobody is signed in; `null` means someone is but the identity is unavailable.
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

export async function signOutAction() {
  const identity = await currentIdentity();
  // Let a failed sign-out propagate: nothing happened, so nothing is recorded.
  await signOut({ redirect: false });
  if (identity !== undefined) recordActivity({ type: ActivityEventType.SignOut, actor: identity });
  redirect("/sign-in");
}
