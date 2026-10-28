import "server-only";
import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { credentialAuthorizations, users } from "@/db/schema";
import { CredentialAuthorizationPurpose, UserRole, type InstanceUserSummary } from "@/data/types";

type InstanceUserRow = Omit<InstanceUserSummary, "isLastCompletedAdmin" | "role" | "setupExpiresAt"> & {
  role: string;
  setupExpiresAt?: Date | string | null;
};

export function toInstanceUserSummaries(rows: InstanceUserRow[]): InstanceUserSummary[] {
  const completedAdmins = rows.filter((user) => user.role === UserRole.Admin && user.setupComplete);
  return [...rows]
    .sort((left, right) => left.username.localeCompare(right.username))
    .map((user) => ({
      id: user.id,
      username: user.username,
      role: user.role === UserRole.Admin ? UserRole.Admin : UserRole.Member,
      setupComplete: user.setupComplete,
      ...(!user.setupComplete && user.setupExpiresAt
        ? { setupExpiresAt: new Date(user.setupExpiresAt).toISOString() }
        : {}),
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
      // Derived, never stored: the open (unconsumed, uninvalidated) setup authorization's expiry. Expired links stay
      // visible so the row can say "Setup expired". The outer id is written qualified: a single-table select strips
      // column qualifiers, which would turn `users.id` into the inner table's own `id`.
      setupExpiresAt: sql<string | null>`(
        select max(${credentialAuthorizations.expiresAt}) from ${credentialAuthorizations}
        where ${credentialAuthorizations.userId} = "users"."id"
          and ${credentialAuthorizations.purpose} = ${CredentialAuthorizationPurpose.Setup}
          and ${credentialAuthorizations.consumedAt} is null and ${credentialAuthorizations.invalidatedAt} is null
      )`,
    })
    .from(users)
    .orderBy(asc(users.username));
  return toInstanceUserSummaries(rows);
}
