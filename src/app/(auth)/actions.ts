"use server";

import { signIn, signOut } from "@/auth";
import { db } from "@/db";
import { users, collaborators } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { detectPreferredCurrency } from "@/lib/utils";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { SQL } from "drizzle-orm";
import type { MfaActionState, SignInActionState } from "@/data/types";
import { lockoutMessage } from "@/lib/auth-throttle";
import { LockedOutError, MfaRequiredError } from "@/lib/authorize-credentials";
import { MFA_COOKIE, MFA_TICKET_TTL_MS, verifyMfaTicket } from "@/lib/mfa";
import { DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE_SECONDS, rememberDevice } from "@/lib/trusted-devices";

type ActionState = { error?: string } | undefined;

// Mirrors Auth.js: cookies are Secure only when the browser reached us over HTTPS, so plain-HTTP LAN installs work.
function isHttps(requestHeaders: Headers): boolean {
  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0].trim();
  if (forwardedProto) return forwardedProto === "https";
  return (process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "").startsWith("https:");
}

// After a successful sign-in, mark this browser as one the user signs in from (see src/lib/trusted-devices.ts).
async function trustThisBrowser(userFilter: SQL | undefined, rememberMfa: boolean): Promise<void> {
  const [user] = await db.select({ id: users.id, sessionVersion: users.sessionVersion }).from(users).where(userFilter);
  if (!user) return;

  const requestHeaders = await headers();
  const cookieJar = await cookies();
  const token = await rememberDevice({
    userId: user.id,
    sessionVersion: user.sessionVersion,
    existingToken: cookieJar.get(DEVICE_COOKIE)?.value,
    userAgent: requestHeaders.get("user-agent"),
    rememberMfa,
  });
  cookieJar.set(DEVICE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(requestHeaders),
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
  });
}

export async function signInAction(_prev: SignInActionState, formData: FormData): Promise<SignInActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (err) {
    if (err instanceof MfaRequiredError) {
      (await cookies()).set(MFA_COOKIE, err.ticket, {
        httpOnly: true,
        sameSite: "lax",
        secure: isHttps(await headers()),
        path: "/",
        maxAge: MFA_TICKET_TTL_MS / 1000,
      });
      return { mfaRequired: true };
    }
    if (err instanceof LockedOutError) return { error: lockoutMessage(err.retryAfterSeconds) };
    if (err instanceof AuthError) return { error: "Invalid email or password." };
    throw err;
  }

  await trustThisBrowser(eq(users.email, email), false);
  redirect("/trips");
}

export async function verifyMfaAction(_prev: MfaActionState, formData: FormData): Promise<MfaActionState> {
  const cookieJar = await cookies();
  const ticket = cookieJar.get(MFA_COOKIE)?.value;
  if (!ticket) return { error: "Your sign-in timed out. Enter your email and password again.", expired: true };

  try {
    await signIn("credentials", { mfaTicket: ticket, code: String(formData.get("code") ?? ""), redirect: false });
  } catch (err) {
    if (err instanceof LockedOutError) return { error: lockoutMessage(err.retryAfterSeconds) };
    if (err instanceof AuthError) return { error: "That code didn't work. Try again." };
    throw err;
  }

  cookieJar.delete(MFA_COOKIE);
  // signIn just verified the ticket, so it names the user who passed both steps.
  const userId = verifyMfaTicket(ticket);
  if (userId) await trustThisBrowser(eq(users.id, userId), formData.get("remember") === "on");
  redirect("/trips");
}

export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (process.env.ALLOW_SIGNUP === "false") return { error: "Signup is disabled." };

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const name = formData.get("name") as string;

  if (!email || !password || password.length < 8) {
    return { error: "Email and password (min 8 chars) required." };
  }

  const acceptLanguage = (await headers()).get("accept-language") ?? "";
  const currency = detectPreferredCurrency(acceptLanguage);
  const passwordHash = await bcrypt.hash(password, 10);
  const [newUser] = await db
    .insert(users)
    .values({ email, name, passwordHash, currency })
    .onConflictDoNothing({ target: users.email })
    .returning();

  if (!newUser) return { error: "An account with that email already exists." };

  // Back-fill collaborators shadow records that were invited before signup.
  await db
    .update(collaborators)
    .set({ userId: newUser.id })
    .where(and(eq(collaborators.email, email), isNull(collaborators.userId)));

  const signInFormData = new FormData();
  signInFormData.set("email", email);
  signInFormData.set("password", password);
  signInFormData.set("redirectTo", "/trips");

  await signIn("credentials", signInFormData);
}

export async function signOutAction() {
  await signOut({ redirectTo: "/sign-in" });
}
