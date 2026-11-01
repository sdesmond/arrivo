import "server-only";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { authThrottle } from "@/db/schema";
import { normalizeUsername } from "@/lib/username";

// Failed-attempt limits for sign-in, password change and two-factor codes, kept in Postgres so they survive
// restarts. Times use the real clock (`new Date()`), not getNow(): the dev date picker must not move a lockout.

export interface ThrottlePolicy {
  maxFailures: number;
  windowMs: number;
  baseLockMs: number;
  maxLockMs: number;
}

export interface ThrottleTarget {
  key: string;
  policy: ThrottlePolicy;
}

export type ThrottleRow = typeof authThrottle.$inferSelect;
export type ThrottleStatus = { locked: false } | { locked: true; retryAfterSeconds: number };

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const STALE_ROW_MS = 24 * HOUR_MS;

// Per account (username, password change, two-factor) and per trusted browser: each repeat lockout doubles, up to
// an hour, so someone who knows a username can't keep its owner locked out for long. A browser the owner has
// signed in from before is limited by its own key instead (see authorize-credentials.ts).
export const ACCOUNT_POLICY: ThrottlePolicy = {
  maxFailures: 5,
  windowMs: 15 * MINUTE_MS,
  baseLockMs: 15 * MINUTE_MS,
  maxLockMs: HOUR_MS,
};

// Per IP: looser, since many people can share one address; stops one client spraying many accounts.
export const IP_POLICY: ThrottlePolicy = {
  maxFailures: 30,
  windowMs: 15 * MINUTE_MS,
  baseLockMs: 15 * MINUTE_MS,
  maxLockMs: HOUR_MS,
};

function positiveIntFromEnv(name: string): number | undefined {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

export function getAccountPolicy(): ThrottlePolicy {
  return { ...ACCOUNT_POLICY, maxFailures: positiveIntFromEnv("AUTH_MAX_FAILURES") ?? ACCOUNT_POLICY.maxFailures };
}

export function getIpPolicy(): ThrottlePolicy {
  return { ...IP_POLICY, maxFailures: positiveIntFromEnv("AUTH_IP_MAX_FAILURES") ?? IP_POLICY.maxFailures };
}

// Keyed by the typed username, not the user id, so unknown usernames lock too and nothing reveals which exist.
export function signInTargets(username: string, ip: string | undefined): ThrottleTarget[] {
  const targets = [{ key: `username:${normalizeUsername(username)}`, policy: getAccountPolicy() }];
  if (ip) targets.push({ key: `ip:${ip}`, policy: getIpPolicy() });
  return targets;
}

// A setup link is a valid credential for its holder, so its budget counts successful exchanges (not failures) and
// is wider than the sign-in budget: a person reopening their own link on a few devices must not lock themselves out.
export const SETUP_MAX_ATTEMPTS = 10;

export function accountTarget(kind: "pwchange" | "mfa" | "device" | "setup" | "reset", id: string): ThrottleTarget {
  const policy = getAccountPolicy();
  return {
    key: `${kind}:${id}`,
    policy: kind === "setup" || kind === "reset" ? { ...policy, maxFailures: SETUP_MAX_ATTEMPTS } : policy,
  };
}

// The standalone server has no socket address to offer, so this relies on the reverse proxy's headers (the
// image already sets AUTH_TRUST_HOST). The last X-Forwarded-For entry is the one the nearest proxy appended;
// earlier entries come from the client and can be anything. Without a proxy the per-IP limit is skipped.
export function clientIpFromHeaders(headers: Headers): string | undefined {
  const forwarded = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || undefined;
}

export function lockoutMessage(retryAfterSeconds: number | undefined): string {
  if (retryAfterSeconds === undefined) return "Too many attempts. Try again later.";
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

export function applyFailure(row: ThrottleRow, now: Date, policy: ThrottlePolicy): ThrottleRow {
  const windowExpired = now.getTime() - row.windowStart.getTime() > policy.windowMs;
  const failures = windowExpired ? 1 : row.failures + 1;
  const windowStart = windowExpired ? now : row.windowStart;

  if (failures < policy.maxFailures) {
    return { ...row, failures, windowStart, lockedUntil: null, updatedAt: now };
  }

  const lockMs = Math.min(policy.baseLockMs * 2 ** row.lockCount, policy.maxLockMs);
  return {
    ...row,
    failures: 0,
    windowStart: now,
    lockedUntil: new Date(now.getTime() + lockMs),
    lockCount: row.lockCount + 1,
    updatedAt: now,
  };
}

export async function checkThrottle(targets: ThrottleTarget[], now = new Date()): Promise<ThrottleStatus> {
  if (targets.length === 0) return { locked: false };

  const rows = await db
    .select({ lockedUntil: authThrottle.lockedUntil })
    .from(authThrottle)
    .where(
      inArray(
        authThrottle.key,
        targets.map((target) => target.key)
      )
    );

  const latestLock = Math.max(0, ...rows.map((throttleRow) => throttleRow.lockedUntil?.getTime() ?? 0));
  if (latestLock <= now.getTime()) return { locked: false };
  return { locked: true, retryAfterSeconds: Math.ceil((latestLock - now.getTime()) / 1000) };
}

export async function recordFailure(targets: ThrottleTarget[], now = new Date()): Promise<void> {
  if (targets.length === 0) return;

  await db.transaction(async (transaction) => {
    for (const target of targets) {
      // Insert-then-lock so concurrent failures for one key serialize instead of overwriting each other's count.
      await transaction
        .insert(authThrottle)
        .values({ key: target.key, failures: 0, windowStart: now, updatedAt: now })
        .onConflictDoNothing();
      const [current] = await transaction
        .select()
        .from(authThrottle)
        .where(eq(authThrottle.key, target.key))
        .for("update");
      const { key, ...next } = applyFailure(current, now, target.policy);
      await transaction.update(authThrottle).set(next).where(eq(authThrottle.key, key));
    }

    await transaction
      .delete(authThrottle)
      .where(
        and(
          lt(authThrottle.updatedAt, new Date(now.getTime() - STALE_ROW_MS)),
          or(isNull(authThrottle.lockedUntil), lt(authThrottle.lockedUntil, now))
        )
      );
  });
}

// Call with account targets only: clearing the IP key on one good sign-in would let a client with a single
// valid account reset its budget for guessing at others.
export async function clearFailures(targets: ThrottleTarget[]): Promise<void> {
  if (targets.length === 0) return;
  await db.delete(authThrottle).where(
    inArray(
      authThrottle.key,
      targets.map((target) => target.key)
    )
  );
}
