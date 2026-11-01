import "server-only";
import { createHash } from "node:crypto";
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

// Limited, recovery-only browser context. The cookie carries the raw recovery token so every request revalidates it by
// digest in the database: replacing the link, expiry or deleting the account revokes it with no cookie-side state.
// It is not an Auth.js session; nothing but this module reads it.
export const ADMIN_RECOVERY_COOKIE = "arrivo_admin_recovery";
// Only the recovery page, its exchange route and its server actions read the cookie, so the browser sends it nowhere else.
export const ADMIN_RECOVERY_COOKIE_PATH = "/account-recovery";

export type AdminRecoveryContext =
  | { status: "ready"; account: CredentialAuthorizationAccount }
  | { status: "unavailable" };

const UNAVAILABLE: AdminRecoveryContext = { status: "unavailable" };
const realClock: CredentialSecurityClock = () => new Date();

function cookieAttributes(maxAgeSeconds: number, https: boolean): string {
  return `Path=${ADMIN_RECOVERY_COOKIE_PATH}; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${https ? "; Secure" : ""}`;
}

/** Set-Cookie value that never outlives the link: Max-Age is the remaining lifetime, floored to whole seconds. */
export function adminRecoveryCookie(
  token: string,
  expiresAt: string,
  { https, now = new Date() }: { https: boolean; now?: Date }
): string {
  const remainingSeconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 1000));
  return `${ADMIN_RECOVERY_COOKIE}=${token}; ${cookieAttributes(remainingSeconds, https)}`;
}

export function clearedAdminRecoveryCookie(https: boolean): string {
  return `${ADMIN_RECOVERY_COOKIE}=; ${cookieAttributes(0, https)}`;
}

interface ResolveOptions {
  headers: Headers;
  database?: CredentialAuthorizationDatabase;
  clock?: CredentialSecurityClock;
  /** Page views do not spend a budget; exchanges and submissions have separate budgets per link. */
  attempt?: "exchange" | "submit";
}

// Separate key from sign-in's `ip:` so spraying recovery tokens cannot lock the same address out of signing in.
function ipTargets(headers: Headers): ThrottleTarget[] {
  const ip = clientIpFromHeaders(headers);
  return ip ? [{ key: `recovery-ip:${ip}`, policy: getIpPolicy() }] : [];
}

/**
 * Resolves the recovery link behind `token` for this request. Every failure (missing, malformed, wrong purpose,
 * expired, replaced, consumed, deleted, throttled) is the same `unavailable` result, so nothing hints at which
 * accounts exist. Never consumes or extends the link.
 */
export async function resolveAdminRecoveryContext(
  token: string | undefined,
  { headers, database = db, clock = realClock, attempt }: ResolveOptions
): Promise<AdminRecoveryContext> {
  if (!token) return UNAVAILABLE;

  const failureTargets = ipTargets(headers);
  if ((await checkThrottle(failureTargets, clock())).locked) return UNAVAILABLE;

  const validated = await validateCredentialAuthorization(
    database,
    { token, purpose: CredentialAuthorizationPurpose.Recovery },
    clock
  );
  if (!validated.ok) {
    if (validated.reason === "invalid") await recordFailure(failureTargets, clock());
    return UNAVAILABLE;
  }

  if (attempt) {
    const digest = createHash("sha256").update(token).digest("hex");
    const target = { ...accountTarget("reset", digest), key: `recovery-${attempt}:${digest}` };
    if ((await checkThrottle([target], clock())).locked) return UNAVAILABLE;
    await recordFailure([target], clock());
  }
  return { status: "ready", account: validated.account };
}
