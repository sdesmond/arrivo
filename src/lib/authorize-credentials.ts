import "server-only";
import { CredentialsSignin } from "@auth/core/errors";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
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
import { isHttpsRequest } from "./request-origin";
import { normalizeUsername } from "./username";
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE_SECONDS,
  findTrustedDevice,
  isMfaRemembered,
  readDeviceToken,
  rememberDevice,
} from "./trusted-devices";

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
  name: string | null;
  sessionVersion: number;
  // Recorded in the session token: removing this browser under Profile → Security signs it out.
  deviceId: string;
  // "Keep me signed in"; unticked sessions end 12 hours after sign-in (src/lib/session-policy.ts).
  keepSignedIn: boolean;
}

// Compared against when the username is unknown, so a miss costs the same bcrypt time as a wrong password.
const DUMMY_PASSWORD_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8ZxHgx4G7R2nqvdTq7SR1RbpqW3k7y";

const userColumns = {
  id: users.id,
  name: users.name,
  passwordHash: users.passwordHash,
  sessionVersion: users.sessionVersion,
  mfaEnabledAt: users.mfaEnabledAt,
  totpSecret: users.totpSecret,
  totpLastStep: users.totpLastStep,
};

type UserRow = {
  id: string;
  name: string | null;
  sessionVersion: number;
};

// Every successful sign-in remembers the browser (OWASP device cookies): it then gets its own failure budget, and it
// shows under Profile → Security as one of "Your browsers". `rememberMfa` is the code step's 30-day opt-in.
async function completeSignIn(
  user: UserRow,
  request: Request,
  { keepSignedIn, rememberMfa }: { keepSignedIn: boolean; rememberMfa: boolean }
): Promise<AuthorizedUser> {
  const { token, deviceId } = await rememberDevice({
    userId: user.id,
    sessionVersion: user.sessionVersion,
    existingToken: readDeviceToken(request.headers.get("cookie")),
    userAgent: request.headers.get("user-agent"),
    rememberMfa,
  });
  // authorize() runs inside the sign-in server action (or the credentials callback route), so it can set cookies.
  (await cookies()).set(DEVICE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttpsRequest(request.headers),
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
  });
  return {
    id: user.id,
    name: user.name,
    sessionVersion: user.sessionVersion,
    deviceId,
    keepSignedIn,
  };
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

// Credentials arrive form-encoded, so booleans are strings.
function booleanField(value: unknown): boolean {
  return value === true || value === "true" || value === "on";
}

async function authorizePassword(username: string, password: string, keepSignedIn: boolean, request: Request) {
  const [user] = await db
    .select(userColumns)
    .from(users)
    .where(sql`lower(${users.username}) = ${normalizeUsername(username)}`);
  // A browser the owner signed in from before gets its own failure budget, so guesses from anywhere else
  // (which count against the username and IP) can't lock them out there.
  const device = user ? await findTrustedDevice(readDeviceToken(request.headers.get("cookie")), user) : null;
  const targets = device
    ? [accountTarget("device", device.id)]
    : signInTargets(username, clientIpFromHeaders(request.headers));

  const throttle = await checkThrottle(targets);
  if (throttle.locked) throw new LockedOutError(throttle.retryAfterSeconds);

  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user?.passwordHash || !valid) {
    await recordFailure(targets);
    return null;
  }

  await clearFailures([targets[0]]);
  if (user.mfaEnabledAt && !isMfaRemembered(device)) {
    throw new MfaRequiredError(createMfaTicket(user.id, { keepSignedIn }));
  }
  return completeSignIn(user, request, { keepSignedIn, rememberMfa: false });
}

async function authorizeSecondFactor(ticket: string, code: string, rememberMfa: boolean, request: Request) {
  const verified = verifyMfaTicket(ticket);
  if (!verified) return null;
  const { userId, keepSignedIn } = verified;

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
  return completeSignIn(user, request, { keepSignedIn, rememberMfa });
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
    return code ? authorizeSecondFactor(ticket, code, booleanField(credentials.remember), request) : null;
  }

  const username = stringField(credentials.username);
  const password = stringField(credentials.password);
  if (!username || !password) return null;
  return authorizePassword(username, password, booleanField(credentials.keepSignedIn), request);
}
