import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { trustedDevices, users } from "@/db/schema";
import type { SessionState } from "./session-policy";
import type { DbTransaction } from "./server-action-locks";

/** Lock the account and reject a session that was revoked after requireUser(). */
export async function lockCurrentSecurityVersion(
  transaction: DbTransaction,
  userId: string,
  sessionVersion: number | undefined
): Promise<boolean> {
  if (sessionVersion === undefined) return false;
  const rows = (await transaction.execute(sql`select ${users.sessionVersion} as "sessionVersion"
    from ${users} where ${users.id} = ${userId} for update`)) as unknown as { sessionVersion: number }[];
  return rows[0]?.sessionVersion === sessionVersion;
}

// Every sign-in token carries the user's session version (see the jwt callback in src/auth.ts); bumping it
// invalidates every token issued before, i.e. signs the user out on all devices.
export async function bumpSessionVersion(userId: string, executor: Pick<DbTransaction, "update"> = db): Promise<void> {
  await executor
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
