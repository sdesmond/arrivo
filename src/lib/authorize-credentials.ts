import "server-only";
import { CredentialsSignin } from "@auth/core/errors";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { AuthErrorCode } from "@/data/types";
import {
  accountTarget,
  checkThrottle,
  clearFailures,
  clientIpFromHeaders,
  recordFailure,
  signInTargets,
} from "./auth-throttle";
import { createMfaTicket, verifyMfaTicket } from "./mfa";
import { verifySecondFactor } from "./mfa-store";
import { findTrustedDevice, isMfaRemembered, readDeviceToken } from "./trusted-devices";

export class LockedOutError extends CredentialsSignin {
  code = AuthErrorCode.Locked;
  constructor(readonly retryAfterSeconds: number) {
    super();
  }
}

// The ticket rides on the error object to the sign-in server action (Auth.js rethrows it as-is there); `code`
// is the only part that reaches a URL when someone posts to /api/auth/callback/credentials directly.
export class MfaRequiredError extends CredentialsSignin {
  code = AuthErrorCode.MfaRequired;
  constructor(readonly ticket: string) {
    super();
  }
}

export interface AuthorizedUser {
  id: string;
  email: string | null;
  name: string | null;
  sessionVersion: number;
}

// Compared against when the email is unknown, so a miss costs the same bcrypt time as a wrong password.
const DUMMY_PASSWORD_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8ZxHgx4G7R2nqvdTq7SR1RbpqW3k7y";

const userColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  passwordHash: users.passwordHash,
  sessionVersion: users.sessionVersion,
  mfaEnabledAt: users.mfaEnabledAt,
  totpSecret: users.totpSecret,
  totpLastStep: users.totpLastStep,
};

function toAuthorizedUser(user: AuthorizedUser): AuthorizedUser {
  return { id: user.id, email: user.email, name: user.name, sessionVersion: user.sessionVersion };
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

async function authorizePassword(email: string, password: string, request: Request) {
  const [user] = await db.select(userColumns).from(users).where(eq(users.email, email));
  // A browser the owner signed in from before gets its own failure budget, so guesses from anywhere else
  // (which count against the email and IP) can't lock them out there.
  const device = user ? await findTrustedDevice(readDeviceToken(request.headers.get("cookie")), user) : null;
  const targets = device
    ? [accountTarget("device", device.id)]
    : signInTargets(email, clientIpFromHeaders(request.headers));

  const throttle = await checkThrottle(targets);
  if (throttle.locked) throw new LockedOutError(throttle.retryAfterSeconds);

  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user?.passwordHash || !valid) {
    await recordFailure(targets);
    return null;
  }

  await clearFailures([targets[0]]);
  if (user.mfaEnabledAt && !isMfaRemembered(device)) throw new MfaRequiredError(createMfaTicket(user.id));
  return toAuthorizedUser(user);
}

async function authorizeSecondFactor(ticket: string, code: string) {
  const userId = verifyMfaTicket(ticket);
  if (!userId) return null;

  const target = accountTarget("mfa", userId);
  const throttle = await checkThrottle([target]);
  if (throttle.locked) throw new LockedOutError(throttle.retryAfterSeconds);

  const [user] = await db.select(userColumns).from(users).where(eq(users.id, userId));
  if (!user?.mfaEnabledAt) return null;

  const accepted = await verifySecondFactor(
    { id: user.id, totpSecret: user.totpSecret, totpLastStep: user.totpLastStep },
    code
  );
  if (!accepted) {
    await recordFailure([target]);
    return null;
  }

  await clearFailures([target]);
  return toAuthorizedUser(user);
}

// The single gate for credential sign-in, including direct POSTs to /api/auth/callback/credentials, so
// neither the throttle nor the second factor can be skipped by bypassing the sign-in form.
export async function authorizeCredentials(
  credentials: Partial<Record<string, unknown>>,
  request: Request
): Promise<AuthorizedUser | null> {
  const ticket = stringField(credentials.mfaTicket);
  if (ticket) {
    const code = stringField(credentials.code);
    return code ? authorizeSecondFactor(ticket, code) : null;
  }

  const email = stringField(credentials.email);
  const password = stringField(credentials.password);
  if (!email || !password) return null;
  return authorizePassword(email, password, request);
}
