import "server-only";
import { db } from "@/db";
import { invitations, trips, users } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { CollaboratorRole, PendingInvitation } from "@/data/types";

export const INVITE_TTL_HOURS = 72;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Case- and whitespace-insensitive equality condition against `emailColumn`. `email` must already
 * be normalized by the caller (via `normalizeEmail`) — this only normalizes the column side.
 *
 * Lives outside `actions.ts` deliberately: that file carries a top-level `"use server"` directive,
 * and Next requires every export from such a file to be an async Server Action. This is a plain
 * query-builder helper, not an action, so it belongs in a non-`"use server"` module.
 */
export function hasNormalizedEmail(emailColumn: AnyPgColumn, email: string) {
  return sql`lower(trim(${emailColumn})) = ${email}`;
}

/**
 * Pending, unexpired invitations addressed to `userEmail`. Single source of truth for both the
 * dashboard "Invitations" list and the sidebar nav badge count — no parallel count query.
 */
export async function getMyPendingInvitations(userEmail: string): Promise<PendingInvitation[]> {
  const normalizedEmail = normalizeEmail(userEmail);

  const rows = await db
    .select({
      id: invitations.id,
      tripId: invitations.tripId,
      tripName: trips.name,
      inviterName: users.name,
      inviterEmail: users.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .innerJoin(trips, eq(invitations.tripId, trips.id))
    .innerJoin(users, eq(invitations.invitedBy, users.id))
    .where(
      and(
        hasNormalizedEmail(invitations.email, normalizedEmail),
        eq(invitations.status, "pending"),
        sql`${invitations.expiresAt} > now()`
      )
    );

  return rows.map((row) => ({
    id: row.id,
    tripId: row.tripId,
    tripName: row.tripName,
    inviterName: row.inviterName ?? row.inviterEmail ?? "",
    inviterEmail: row.inviterEmail ?? "",
    role: row.role as CollaboratorRole,
    expiresAt: row.expiresAt.toISOString(),
  }));
}
