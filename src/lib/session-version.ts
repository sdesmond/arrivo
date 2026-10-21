import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

// Every sign-in token carries the user's session version (see the jwt callback in src/auth.ts); bumping it
// invalidates every token issued before, i.e. signs the user out on all devices.
export async function bumpSessionVersion(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, userId));
}

export async function getSessionVersion(userId: string): Promise<number | undefined> {
  const [row] = await db.select({ sessionVersion: users.sessionVersion }).from(users).where(eq(users.id, userId));
  return row?.sessionVersion;
}
