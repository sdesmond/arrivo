import { and, eq } from "drizzle-orm";
import { invitations } from "@/db/schema";
import type { CollaboratorRole, ResendInvitationResult } from "@/data/types";
import type { DbTransaction } from "@/lib/server-action-locks";

type InvitationExecutor = Pick<DbTransaction, "select" | "update">;

export type AppliedInvitationResend =
  | { status: "success"; expiresAt: string; inviteeId: string }
  | Extract<ResendInvitationResult, { status: "error" }>;

/**
 * Resets `expiresAt` (and optionally `role`) on a trip's pending invitation. Takes an `executor` so
 * callers already inside a transaction (e.g. `inviteContributor`'s re-invite branch) can reuse this
 * instead of hand-rolling the same update — the auth check stays with the standalone `resendInvitation`
 * in `invitations.ts` since transactional callers have already authorized the caller themselves.
 */
export async function applyInvitationResend(
  executor: InvitationExecutor,
  invitationId: string,
  tripId: string,
  expiresAt: Date,
  role?: CollaboratorRole
): Promise<AppliedInvitationResend> {
  const [resentInvitation] = await executor
    .update(invitations)
    .set(role ? { expiresAt, role } : { expiresAt })
    .where(and(eq(invitations.id, invitationId), eq(invitations.tripId, tripId), eq(invitations.status, "pending")))
    .returning({ id: invitations.id, inviteeId: invitations.inviteeId });

  if (resentInvitation) {
    return { status: "success", expiresAt: expiresAt.toISOString(), inviteeId: resentInvitation.inviteeId };
  }

  const [invitation] = await executor
    .select({ id: invitations.id, tripId: invitations.tripId })
    .from(invitations)
    .where(eq(invitations.id, invitationId));
  return {
    status: "error",
    message: invitation && invitation.tripId === tripId ? "Invitation is no longer pending." : "Invitation not found.",
  };
}
