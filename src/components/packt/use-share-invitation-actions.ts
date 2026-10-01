"use client";

import { useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { toast } from "sonner";
import {
  dismissShareInvitation,
  rescindShareInvitation,
  resendShareInvitation,
} from "@/app/(app)/trips/[tripId]/actions";
import type { InvitationRowAction } from "@/components/packt/trip-share-invitation-row";
import type { ShareDialogData } from "@/components/packt/use-trip-share-dialog-controller";
import type { Invitation } from "@/data/types";

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
        const result = await resendShareInvitation(tripId, invitation.id);
        if (!isCurrentRef.current) return;
        if (result.status === "error") return void toast.error(result.message);
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
      } catch {
        if (isCurrentRef.current) toast.error("Could not resend invitation.");
      }
    });
  }
  async function removeInvitation(
    invitation: Invitation,
    action: "rescind" | "dismiss",
    request: () => Promise<{ status: "success" } | { status: "error"; message: string }>
  ): Promise<void> {
    await runInvitationAction(invitation, action, async () => {
      try {
        const result = await request();
        if (!isCurrentRef.current) return;
        if (result.status === "error") return void toast.error(result.message);
        suppressedInvitationIdsRef.current.add(invitation.id);
        setData((currentData) =>
          currentData
            ? { ...currentData, invitations: currentData.invitations.filter((item) => item.id !== invitation.id) }
            : currentData
        );
        toast.success(action === "rescind" ? "Invitation rescinded." : "Invitation dismissed.");
      } catch {
        if (isCurrentRef.current) {
          toast.error(action === "rescind" ? "Could not rescind invitation." : "Could not dismiss invitation.");
        }
      }
    });
  }
  function rescindPendingInvitation(invitation: Invitation): Promise<void> {
    return removeInvitation(invitation, "rescind", () => rescindShareInvitation(tripId, invitation.id));
  }
  function dismissDeclinedInvitation(invitation: Invitation): Promise<void> {
    return removeInvitation(invitation, "dismiss", () => dismissShareInvitation(tripId, invitation.id));
  }

  return { dismissDeclinedInvitation, pendingActions, rescindPendingInvitation, resendPendingInvitation };
}
