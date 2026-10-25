import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { UserRole } from "@/data/types";

/** Instance authority is always read from the current database row. */
export async function isInstanceAdmin(userId: string): Promise<boolean> {
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  return user?.role === UserRole.Admin;
}
