import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { trustedDevices, users } from "@/db/schema";
import type { TrustedDeviceSummary } from "@/data/types";

// One random token per browser, in an httpOnly cookie; only its SHA-256 is stored. See trustedDevices in
// src/db/schema.ts for what trust buys.
export const DEVICE_COOKIE = "arrivo_device";
export const DEVICE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const MFA_REMEMBER_MS = 30 * DAY_MS;
const STALE_DEVICE_MS = 365 * DAY_MS;

export type TrustedDeviceRow = typeof trustedDevices.$inferSelect;

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function readDeviceToken(cookieHeader: string | null): string | undefined {
  for (const part of cookieHeader?.split(";") ?? []) {
    const [name, ...value] = part.trim().split("=");
    if (name === DEVICE_COOKIE) return value.join("=") || undefined;
  }
  return undefined;
}

// Order matters: Edge and Chrome on iOS/Android also say "Chrome"/"Safari", and every iOS browser says "Safari".
const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];
const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Windows/, "Windows"],
  [/Linux|X11/, "Linux"],
];

export function describeUserAgent(userAgent: string | null): string {
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent ?? ""))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent ?? ""))?.[1];
  if (!browser || !system) return "Unknown browser";
  return `${browser} on ${system}`;
}

export async function findTrustedDevice(
  token: string | undefined,
  user: { id: string; sessionVersion: number }
): Promise<TrustedDeviceRow | null> {
  if (!token) return null;
  const [row] = await db
    .select()
    .from(trustedDevices)
    .where(eq(trustedDevices.tokenHash, hashDeviceToken(token)));
  if (!row || row.userId !== user.id || row.sessionVersion !== user.sessionVersion) return null;
  return row;
}

export function isMfaRemembered(
  device: Pick<TrustedDeviceRow, "mfaRememberedUntil"> | null,
  now = new Date()
): boolean {
  return !!device?.mfaRememberedUntil && device.mfaRememberedUntil > now;
}

interface RememberDeviceInput {
  userId: string;
  sessionVersion: number;
  existingToken: string | undefined;
  userAgent: string | null;
  rememberMfa: boolean;
  now?: Date;
}

// Called on every successful sign-in; returns the token the browser should hold from now on and the device id the
// session token records, so removing the browser under Profile → Security signs it out.
export async function rememberDevice({
  userId,
  sessionVersion,
  existingToken,
  userAgent,
  rememberMfa,
  now = new Date(),
}: RememberDeviceInput): Promise<{ token: string; deviceId: string }> {
  const label = describeUserAgent(userAgent);
  const mfaRememberedUntil = rememberMfa ? new Date(now.getTime() + MFA_REMEMBER_MS) : undefined;

  const current = await findTrustedDevice(existingToken, { id: userId, sessionVersion });
  if (current && existingToken) {
    await db
      .update(trustedDevices)
      .set({ lastUsedAt: now, label, ...(mfaRememberedUntil && { mfaRememberedUntil }) })
      .where(eq(trustedDevices.id, current.id));
    return { token: existingToken, deviceId: current.id };
  }

  // The browser's old token is stale (revoked) or another account's; one cookie slot, so it's replaced.
  if (existingToken) {
    await db.delete(trustedDevices).where(eq(trustedDevices.tokenHash, hashDeviceToken(existingToken)));
  }
  const token = randomBytes(32).toString("base64url");
  const [created] = await db
    .insert(trustedDevices)
    .values({
      userId,
      tokenHash: hashDeviceToken(token),
      label,
      sessionVersion,
      mfaRememberedUntil: mfaRememberedUntil ?? null,
      lastUsedAt: now,
    })
    .returning({ id: trustedDevices.id });
  await db.delete(trustedDevices).where(lt(trustedDevices.lastUsedAt, new Date(now.getTime() - STALE_DEVICE_MS)));
  return { token, deviceId: created.id };
}

export async function listTrustedDevices(
  userId: string,
  currentToken: string | undefined,
  now = new Date()
): Promise<TrustedDeviceSummary[]> {
  const currentHash = currentToken ? hashDeviceToken(currentToken) : undefined;
  // Joined on the user's session version so devices revoked by the last bump don't show up.
  const rows = await db
    .select({
      id: trustedDevices.id,
      label: trustedDevices.label,
      tokenHash: trustedDevices.tokenHash,
      lastUsedAt: trustedDevices.lastUsedAt,
      mfaRememberedUntil: trustedDevices.mfaRememberedUntil,
    })
    .from(trustedDevices)
    .innerJoin(users, and(eq(users.id, trustedDevices.userId), eq(users.sessionVersion, trustedDevices.sessionVersion)))
    .where(eq(trustedDevices.userId, userId))
    .orderBy(desc(trustedDevices.lastUsedAt));

  return rows.map((device) => ({
    id: device.id,
    label: device.label,
    lastUsedAt: device.lastUsedAt.toISOString(),
    ...(isMfaRemembered(device, now) && { mfaRememberedUntil: device.mfaRememberedUntil!.toISOString() }),
    isCurrent: device.tokenHash === currentHash,
  }));
}

// Removing a browser also signs it out: its session token names this device, and the jwt callback drops tokens
// whose device is gone. `wasCurrent` tells the caller it just removed the browser making the request.
export async function forgetTrustedDevice(
  userId: string,
  deviceId: string,
  currentToken: string | undefined
): Promise<{ wasCurrent: boolean }> {
  const [removed] = await db
    .delete(trustedDevices)
    .where(and(eq(trustedDevices.id, deviceId), eq(trustedDevices.userId, userId)))
    .returning({ tokenHash: trustedDevices.tokenHash });
  return { wasCurrent: !!removed && !!currentToken && removed.tokenHash === hashDeviceToken(currentToken) };
}
