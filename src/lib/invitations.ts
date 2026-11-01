import "server-only";
import { db } from "@/db";
import { invitations, trips, users } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { LiveSyncEventType } from "@/data/types";
import type { CollaboratorRole, PendingInvitation, ResendInvitationResult } from "@/data/types";
import { assertTripAccess } from "@/lib/auth-helpers";
import { getNow } from "@/lib/mock-date";
import { applyInvitationResend } from "@/lib/invitation-resend";
import { publishTripEvent, publishUserEvent } from "@/lib/trip-events";

export { applyInvitationResend };

export const INVITE_TTL_HOURS = 72;

export function getInvitationExpiry(now = getNow()): Date {
  return new Date(now.getTime() + INVITE_TTL_HOURS * 60 * 60 * 1000);
}

/**
 * Case-insensitive equality condition against `usernameColumn`, matching the lower(username) unique
 * index. `username` must already be normalized by the caller (via `normalizeUsername`).
 *
 * Lives outside `actions.ts` deliberately: that file carries a top-level `"use server"` directive,
 * and Next requires every export from such a file to be an async Server Action. This is a plain
 * query-builder helper, not an action, so it belongs in a non-`"use server"` module.
 */
export function hasNormalizedUsername(usernameColumn: AnyPgColumn, username: string) {
  return sql`lower(${usernameColumn}) = ${username}`;
}

/**
 * Pending, unexpired invitations addressed to `userId`. Single source of truth for both the
 * dashboard "Invitations" list and the sidebar nav badge count — no parallel count query.
 */
export async function getMyPendingInvitations(userId: string): Promise<PendingInvitation[]> {
  const rows = await db
    .select({
      id: invitations.id,
      tripId: invitations.tripId,
      tripName: trips.name,
      inviterName: users.name,
      inviterUsername: users.username,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .innerJoin(trips, eq(invitations.tripId, trips.id))
    .innerJoin(users, eq(invitations.invitedBy, users.id))
    .where(
      and(eq(invitations.inviteeId, userId), eq(invitations.status, "pending"), sql`${invitations.expiresAt} > now()`)
    );

  return rows.map((row) => ({
    id: row.id,
    tripId: row.tripId,
    tripName: row.tripName,
    inviterName: row.inviterName ?? row.inviterUsername,
    inviterUsername: row.inviterUsername,
    role: row.role as CollaboratorRole,
    expiresAt: row.expiresAt.toISOString(),
  }));
}

export async function resendInvitation(
  invitationId: string,
  tripId: string,
  userId: string
): Promise<ResendInvitationResult> {
  await assertTripAccess(tripId, userId, "manager");

  const result = await applyInvitationResend(db, invitationId, tripId, getInvitationExpiry());
  if (result.status !== "success") return result;

  // Trip channel: other managers' open share dialogs pick up the new expiry.
  publishTripEvent(tripId, { type: LiveSyncEventType.MembershipChanged, tripId });
  publishInvitationChanged(result.inviteeId, tripId);
  return { status: "success", expiresAt: result.expiresAt };
}

/**
 * Tells the invitee's open sessions (dashboard list, sidebar badge) that an invitation addressed to
 * them changed. Callers run this after their mutation commits.
 */
export function publishInvitationChanged(inviteeId: string, tripId: string): void {
  publishUserEvent(inviteeId, { type: LiveSyncEventType.InvitationChanged, tripId });
}
