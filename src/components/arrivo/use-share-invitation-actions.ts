"use client";

import { useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import * as contract from "@/lib/api/contract/sharing";
import type { InvitationRowAction } from "@/components/arrivo/trip-share-invitation-row";
import type { Invitation, ShareDialogData } from "@/data/types";

interface UseShareInvitationActionsOptions {
  isCurrentRef: RefObject<boolean>;
  setData: Dispatch<SetStateAction<ShareDialogData | null>>;
  // Rescinded/dismissed ids stay hidden even if a later refetch (invite, live event) still returns them.
  suppressedInvitationIdsRef: RefObject<Set<string>>;
  tripId: string;
}

/** Per-row resend / rescind / dismiss for the share dialog's invitation list. */
export function useShareInvitationActions({
  isCurrentRef,
  setData,
  suppressedInvitationIdsRef,
  tripId,
}: UseShareInvitationActionsOptions) {
  const [pendingActions, setPendingActions] = useState<Record<string, InvitationRowAction>>({});

  async function runInvitationAction(
    invitation: Invitation,
    action: InvitationRowAction,
    operation: () => Promise<void>
  ): Promise<void> {
    setPendingActions((currentActions) => ({ ...currentActions, [invitation.id]: action }));
    try {
      await operation();
    } finally {
      if (isCurrentRef.current) {
        setPendingActions((currentActions) => {
          const nextActions = { ...currentActions };
          delete nextActions[invitation.id];
          return nextActions;
        });
      }
    }
  }
  async function resendPendingInvitation(invitation: Invitation): Promise<void> {
    await runInvitationAction(invitation, "resend", async () => {
      try {
        const result = await api(contract.resendInvitation, {
          params: { invitationId: invitation.id },
          body: { tripId },
        });
        if (!isCurrentRef.current) return;
        setData((currentData) =>
          currentData
            ? {
                ...currentData,
                invitations: currentData.invitations.map((item) =>
                  item.id === invitation.id ? { ...item, expiresAt: result.expiresAt } : item
                ),
              }
            : currentData
        );
        toast.success("Invitation resent.");
      } catch (error) {
        if (isCurrentRef.current)
          toast.error(error instanceof ApiClientError ? error.message : "Could not resend invitation.");
      }
    });
  }
  async function removeInvitation(
    invitation: Invitation,
    action: "rescind" | "dismiss",
    request: () => Promise<{ status: "success" }>
  ): Promise<void> {
    await runInvitationAction(invitation, action, async () => {
      try {
        await request();
        if (!isCurrentRef.current) return;
        suppressedInvitationIdsRef.current.add(invitation.id);
        setData((currentData) =>
          currentData
            ? { ...currentData, invitations: currentData.invitations.filter((item) => item.id !== invitation.id) }
            : currentData
        );
      } catch (error) {
        if (isCurrentRef.current) {
          toast.error(
            error instanceof ApiClientError
              ? error.message
              : action === "rescind"
                ? "Could not rescind invitation."
                : "Could not dismiss invitation."
          );
        }
      }
    });
  }
  function rescindPendingInvitation(invitation: Invitation): Promise<void> {
    return removeInvitation(invitation, "rescind", () =>
      api(contract.rescindInvitation, { params: { tripId, invitationId: invitation.id }, body: {} })
    );
  }
  function dismissDeclinedInvitation(invitation: Invitation): Promise<void> {
    return removeInvitation(invitation, "dismiss", () =>
      api(contract.dismissInvitation, { params: { invitationId: invitation.id }, body: { tripId } })
    );
  }

  return { dismissDeclinedInvitation, pendingActions, rescindPendingInvitation, resendPendingInvitation };
}
