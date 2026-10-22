import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { trustedDevices, users } from "@/db/schema";
import type { SessionState } from "./session-policy";

// Every sign-in token carries the user's session version (see the jwt callback in src/auth.ts); bumping it
// invalidates every token issued before, i.e. signs the user out on all devices.
export async function bumpSessionVersion(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, userId));
}

// One lookup per auth() call: the user's session version, and whether the browser the token came from is still
// remembered at that version (see isTokenRevoked in src/lib/session-policy.ts).
export async function getSessionState(userId: string, deviceId: string | undefined): Promise<SessionState | undefined> {
  if (!deviceId) {
    const [row] = await db.select({ sessionVersion: users.sessionVersion }).from(users).where(eq(users.id, userId));
    return row && { sessionVersion: row.sessionVersion, deviceActive: false };
  }

  const [row] = await db
    .select({ sessionVersion: users.sessionVersion, deviceId: trustedDevices.id })
    .from(users)
    .leftJoin(
      trustedDevices,
      and(
        eq(trustedDevices.id, deviceId),
        eq(trustedDevices.userId, users.id),
        eq(trustedDevices.sessionVersion, users.sessionVersion)
      )
    )
    .where(eq(users.id, userId));
  return row && { sessionVersion: row.sessionVersion, deviceActive: row.deviceId !== null };
}
