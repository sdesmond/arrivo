import "server-only";
import { db } from "@/db";
import {
  CredentialAuthorizationPurpose,
  type CredentialAuthorizationAccount,
  type CredentialSecurityClock,
} from "@/data/types";
import {
  accountTarget,
  checkThrottle,
  clientIpFromHeaders,
  getIpPolicy,
  recordFailure,
  type ThrottleTarget,
} from "@/lib/auth-throttle";
import { validateCredentialAuthorization, type CredentialAuthorizationDatabase } from "@/lib/credential-authorizations";

// Limited, reset-only browser context. The cookie carries the raw reset token so every request revalidates it by
// digest in the database: replacing the link, expiry or deleting the account revokes it with no cookie-side state.
// It is not an Auth.js session; nothing but this module reads it.
export const PASSWORD_RESET_COOKIE = "arrivo_password_reset";
// Only the reset page, its exchange route and its server actions read the cookie, so the browser sends it nowhere else.
export const PASSWORD_RESET_COOKIE_PATH = "/account-reset";

export type PasswordResetContext =
  | { status: "ready"; account: CredentialAuthorizationAccount }
  | { status: "unavailable" };

const UNAVAILABLE: PasswordResetContext = { status: "unavailable" };
const realClock: CredentialSecurityClock = () => new Date();

function cookieAttributes(maxAgeSeconds: number, https: boolean): string {
  return `Path=${PASSWORD_RESET_COOKIE_PATH}; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${https ? "; Secure" : ""}`;
}

/** Set-Cookie value that never outlives the link: Max-Age is the remaining lifetime, floored to whole seconds. */
export function passwordResetCookie(
  token: string,
  expiresAt: string,
  { https, now = new Date() }: { https: boolean; now?: Date }
): string {
  const remainingSeconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 1000));
  return `${PASSWORD_RESET_COOKIE}=${token}; ${cookieAttributes(remainingSeconds, https)}`;
}

export function clearedPasswordResetCookie(https: boolean): string {
  return `${PASSWORD_RESET_COOKIE}=; ${cookieAttributes(0, https)}`;
}

interface ResolveOptions {
  headers: Headers;
  database?: CredentialAuthorizationDatabase;
  clock?: CredentialSecurityClock;
  /** True only for a link exchange: a valid exchange spends the account's budget, a page view does not. */
  countAttempt?: boolean;
}

// Separate key from sign-in's `ip:` so spraying reset tokens cannot lock the same address out of signing in.
function ipTargets(headers: Headers): ThrottleTarget[] {
  const ip = clientIpFromHeaders(headers);
  return ip ? [{ key: `reset-ip:${ip}`, policy: getIpPolicy() }] : [];
}

/**
 * Resolves the reset link behind `token` for this request. Every failure (missing, malformed, wrong purpose,
 * expired, replaced, consumed, deleted, throttled) is the same `unavailable` result, so nothing hints at which
 * accounts exist. Never consumes or extends the link.
 */
export async function resolvePasswordResetContext(
  token: string | undefined,
  { headers, database = db, clock = realClock, countAttempt = false }: ResolveOptions
): Promise<PasswordResetContext> {
  if (!token) return UNAVAILABLE;

  const failureTargets = ipTargets(headers);
  if ((await checkThrottle(failureTargets, clock())).locked) return UNAVAILABLE;

  const validated = await validateCredentialAuthorization(
    database,
    { token, purpose: CredentialAuthorizationPurpose.Reset },
    clock
  );
  if (!validated.ok) {
    if (validated.reason === "invalid") await recordFailure(failureTargets, clock());
    return UNAVAILABLE;
  }

  const target = accountTarget("reset", validated.account.userId);
  if ((await checkThrottle([target], clock())).locked) return UNAVAILABLE;
  if (countAttempt) await recordFailure([target], clock());
  return { status: "ready", account: validated.account };
}
