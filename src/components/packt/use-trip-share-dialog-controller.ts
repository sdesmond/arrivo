"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { inviteContributor } from "@/app/(app)/trips/actions";
import {
  dismissShareInvitation,
  getShareDialogData,
  rescindShareInvitation,
  resendShareInvitation,
  saveContributorChanges,
} from "@/app/(app)/trips/[tripId]/actions";
import type { InvitationRowAction } from "@/components/packt/trip-share-invitation-row";
import { CollaboratorRole, type Collaborator, type ContributorChange, type Invitation } from "@/data/types";
export interface ShareDialogData {
  collaborators: Collaborator[];
  currentCollaboratorId: string | null;
  invitations: Invitation[];
}
interface UseTripShareDialogControllerOptions {
  onRequestClose: () => void;
  tripId: string;
}
const RECOVERY_WARNING = "Sharing details may be out of date. Close and reopen to refresh.";
export function useTripShareDialogController({ onRequestClose, tripId }: UseTripShareDialogControllerOptions) {
  const [data, setData] = useState<ShareDialogData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CollaboratorRole>(CollaboratorRole.Viewer);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<Record<string, InvitationRowAction>>({});
  const suppressedInvitationIdsRef = useRef(new Set<string>());
  const [stagedChanges, setStagedChanges] = useState<Record<string, ContributorChange>>({});
  const [isSavingChanges, setIsSavingChanges] = useState(false);
  const isSavingChangesRef = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [recoveryWarning, setRecoveryWarning] = useState<string | null>(null);
  const hasPendingChanges = Object.keys(stagedChanges).length > 0;
  function withoutSuppressedInvitations(nextData: ShareDialogData): ShareDialogData {
    return {
      ...nextData,
      invitations: nextData.invitations.filter((invitation) => !suppressedInvitationIdsRef.current.has(invitation.id)),
    };
  }
  function stageRoleChange(collaborator: Collaborator, nextRole: CollaboratorRole): void {
    if (isSavingChangesRef.current) return;
    const collaboratorId = collaborator.id;
    if (!collaboratorId) return;
    const originalCollaborator = data?.collaborators.find((item) => item.id === collaboratorId);
    setStagedChanges((currentChanges) => ({
      ...currentChanges,
      [collaboratorId]: {
        type: "role",
        collaboratorId,
        fromRole: originalCollaborator?.role ?? collaborator.role,
        toRole: nextRole,
      },
    }));
    setSaveError(null);
  }
  function stageRemoval(collaborator: Collaborator): void {
    if (isSavingChangesRef.current) return;
    const collaboratorId = collaborator.id;
    if (!collaboratorId) return;
    setStagedChanges((currentChanges) => ({
      ...currentChanges,
      [collaboratorId]: { type: "remove", collaboratorId },
    }));
    setSaveError(null);
  }
  function collaboratorWithStagedChanges(collaborator: Collaborator): Collaborator {
    const staged = collaborator.id ? stagedChanges[collaborator.id] : undefined;
    return staged?.type === "role" ? { ...collaborator, role: staged.toRole } : collaborator;
  }
  async function handleSaveChanges(): Promise<void> {
    if (isSavingChangesRef.current) return;
    const changes = Object.values(stagedChanges);
    if (changes.length === 0) return;
    isSavingChangesRef.current = true;
    setIsSavingChanges(true);
    setSaveError(null);
    try {
      const result = await saveContributorChanges(tripId, changes);
      if (result.status === "error") {
        setSaveError(result.message);
        if (result.stale) {
          setStagedChanges({});
          try {
            setData(withoutSuppressedInvitations(await getShareDialogData(tripId)));
            setLoadError(false);
          } catch {
            setRecoveryWarning(RECOVERY_WARNING);
          }
        }
        return;
      }
      setStagedChanges({});
      toast.success("Contributor changes saved.");
      onRequestClose();
    } catch {
      toast.error("Could not save changes.");
    } finally {
      isSavingChangesRef.current = false;
      setIsSavingChanges(false);
    }
  }
  function handleCancelChanges(): void {
    if (isSavingChangesRef.current) return;
    setStagedChanges({});
    setSaveError(null);
    onRequestClose();
  }
  async function handleInvite(): Promise<void> {
    if (isSavingChangesRef.current || !email.trim()) return;
    setInviteLoading(true);
    setInviteError(null);
    try {
      const result = await inviteContributor(tripId, email, role);
      if (result.status === "error") {
        if (result.message === "No Packt account found for this email") {
          setInviteError("No Packt account found for this email.");
        } else toast.error(result.message);
        return;
      }
      toast.success(result.status === "resent" ? "Invitation resent." : "Invitation sent.");
      try {
        setData(withoutSuppressedInvitations(await getShareDialogData(tripId)));
        setLoadError(false);
      } catch {
        setLoadError(true);
      }
      setEmail("");
      setRole(CollaboratorRole.Viewer);
    } catch {
      toast.error("Could not send invitation.");
    } finally {
      setInviteLoading(false);
    }
  }
  async function runInvitationAction(
    invitation: Invitation,
    action: InvitationRowAction,
    operation: () => Promise<void>
  ): Promise<void> {
    setPendingActions((currentActions) => ({ ...currentActions, [invitation.id]: action }));
    try {
      await operation();
    } finally {
      setPendingActions((currentActions) => {
        const nextActions = { ...currentActions };
        delete nextActions[invitation.id];
        return nextActions;
      });
    }
  }
  async function resendPendingInvitation(invitation: Invitation): Promise<void> {
    await runInvitationAction(invitation, "resend", async () => {
      try {
        const result = await resendShareInvitation(tripId, invitation.id);
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
        toast.error("Could not resend invitation.");
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
        if (result.status === "error") return void toast.error(result.message);
        suppressedInvitationIdsRef.current.add(invitation.id);
        setData((currentData) =>
          currentData
            ? { ...currentData, invitations: currentData.invitations.filter((item) => item.id !== invitation.id) }
            : currentData
        );
        toast.success(action === "rescind" ? "Invitation rescinded." : "Invitation dismissed.");
      } catch {
        toast.error(action === "rescind" ? "Could not rescind invitation." : "Could not dismiss invitation.");
      }
    });
  }
  function rescindPendingInvitation(invitation: Invitation): Promise<void> {
    return removeInvitation(invitation, "rescind", () => rescindShareInvitation(tripId, invitation.id));
  }
  function dismissDeclinedInvitation(invitation: Invitation): Promise<void> {
    return removeInvitation(invitation, "dismiss", () => dismissShareInvitation(tripId, invitation.id));
  }
  useEffect(() => {
    let isCurrent = true;
    void getShareDialogData(tripId)
      .then((nextData) => {
        if (!isCurrent) return;
        setData(withoutSuppressedInvitations(nextData));
        setLoadError(false);
      })
      .catch(() => {
        if (!isCurrent) return;
        setData(null);
        setLoadError(true);
        toast.error("Could not load sharing details");
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [tripId]);
  return {
    collaboratorWithStagedChanges,
    data,
    dismissDeclinedInvitation,
    email,
    handleCancelChanges,
    handleInvite,
    handleSaveChanges,
    hasPendingChanges,
    inviteError,
    inviteLoading,
    isLoading,
    isSavingChanges,
    loadError,
    pendingActions,
    recoveryWarning,
    resendPendingInvitation,
    rescindPendingInvitation,
    role,
    saveError,
    setEmail,
    setInviteError,
    setRole,
    stagedChanges,
    stageRemoval,
    stageRoleChange,
  };
}
