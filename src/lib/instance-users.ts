import "server-only";
import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { UserRole, type InstanceUserSummary } from "@/data/types";

type InstanceUserRow = Omit<InstanceUserSummary, "isLastCompletedAdmin" | "role"> & { role: string };

export function toInstanceUserSummaries(rows: InstanceUserRow[]): InstanceUserSummary[] {
  const completedAdmins = rows.filter((user) => user.role === UserRole.Admin && user.setupComplete);
  return [...rows]
    .sort((left, right) => left.username.localeCompare(right.username))
    .map((user) => ({
      id: user.id,
      username: user.username,
      role: user.role === UserRole.Admin ? UserRole.Admin : UserRole.Member,
      setupComplete: user.setupComplete,
      isLastCompletedAdmin: completedAdmins.length === 1 && completedAdmins[0].id === user.id,
    }));
}

export async function listInstanceUsers(): Promise<InstanceUserSummary[]> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      setupComplete: sql<boolean>`${users.passwordHash} is not null`,
    })
    .from(users)
    .orderBy(asc(users.username));
  return toInstanceUserSummaries(rows);
}
