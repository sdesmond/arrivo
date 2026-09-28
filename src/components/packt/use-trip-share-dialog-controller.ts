"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getShareDialogData, saveContributorChanges } from "@/app/(app)/trips/[tripId]/actions";
import { useShareInvitationActions } from "@/components/packt/use-share-invitation-actions";
import { useTripShareInviteForm } from "@/components/packt/use-trip-share-invite-form";
import { LiveSyncEventType } from "@/data/types";
import type { Collaborator, CollaboratorRole, ContributorChange, Invitation } from "@/data/types";
import { useLiveSync } from "@/lib/use-live-sync";
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
type ShareDataRefreshReason = "load" | "invite" | "live" | "recovery";
export function useTripShareDialogController({ onRequestClose, tripId }: UseTripShareDialogControllerOptions) {
  const [data, setData] = useState<ShareDialogData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const suppressedInvitationIdsRef = useRef(new Set<string>());
  const [stagedChanges, setStagedChanges] = useState<Record<string, ContributorChange>>({});
  const [isSavingChanges, setIsSavingChanges] = useState(false);
  const isSavingChangesRef = useRef(false);
  // A membership change that lands mid-save is replayed once the save settles without closing.
  const missedLiveRefreshRef = useRef(false);
  // Bumped per fetch so only the newest response is applied when refetches overlap.
  const fetchSequenceRef = useRef(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [recoveryWarning, setRecoveryWarning] = useState<string | null>(null);
  const hasPendingChanges = Object.keys(stagedChanges).length > 0;
  const isCurrentRef = useRef(true);
  useEffect(() => {
    isCurrentRef.current = true;
    return () => {
      isCurrentRef.current = false;
    };
  }, []);
  const invitationActions = useShareInvitationActions({ isCurrentRef, setData, suppressedInvitationIdsRef, tripId });
  // True once any fetch has applied data, so a failed background refetch keeps what is on screen.
  const hasDataRef = useRef(false);
  function applyShareData(nextData: ShareDialogData): void {
    hasDataRef.current = true;
    setData({
      ...nextData,
      invitations: nextData.invitations.filter((invitation) => !suppressedInvitationIdsRef.current.has(invitation.id)),
    });
    setLoadError(false);
    // A collaborator who left (or was removed elsewhere) can no longer carry a staged change.
    const remainingIds = new Set(nextData.collaborators.map((collaborator) => collaborator.id));
    setStagedChanges((currentChanges) =>
      Object.fromEntries(Object.entries(currentChanges).filter(([collaboratorId]) => remainingIds.has(collaboratorId)))
    );
  }
  function reportRefreshFailure(reason: ShareDataRefreshReason): void {
    if (reason === "load") {
      setData(null);
      setLoadError(true);
      toast.error("Could not load sharing details");
    } else if (reason === "recovery") {
      setRecoveryWarning(RECOVERY_WARNING);
    } else if (reason === "invite" || !hasDataRef.current) {
      setLoadError(true);
    }
    // A failed live refetch over data already on screen stays silent; the next event or a reopen recovers.
  }
  /**
   * The one path every fetch takes. Only the newest fetch may apply data, report a failure or end
   * the loading state, so an older response (or rejection) that lands late never overwrites it.
   * Resolves false only when this fetch was the newest and it failed.
   */
  async function refreshShareData(reason: ShareDataRefreshReason): Promise<boolean> {
    const sequence = ++fetchSequenceRef.current;
    const isNewest = () => isCurrentRef.current && sequence === fetchSequenceRef.current;
    try {
      const nextData = await getShareDialogData(tripId);
      if (isNewest()) applyShareData(nextData);
      return true;
    } catch {
      if (!isNewest()) return true;
      reportRefreshFailure(reason);
      return false;
    } finally {
      if (isNewest()) setIsLoading(false);
    }
  }
  async function refreshAfterInvite(): Promise<void> {
    await refreshShareData("invite");
  }
  useLiveSync(`/api/trips/${tripId}/events`, (event) => {
    if (event.type !== LiveSyncEventType.MembershipChanged) return;
    if (isSavingChangesRef.current) {
      missedLiveRefreshRef.current = true;
      return;
    }
    void refreshShareData("live");
  });
  const inviteForm = useTripShareInviteForm({
    tripId,
    isBlocked: () => isSavingChangesRef.current,
    onInvited: refreshAfterInvite,
  });
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
    missedLiveRefreshRef.current = false;
    setIsSavingChanges(true);
    setSaveError(null);
    let didRecoverData = false;
    try {
      const result = await saveContributorChanges(tripId, changes);
      if (!isCurrentRef.current) return;
      if (result.status === "error") {
        setSaveError(result.message);
        if (result.stale) {
          setStagedChanges({});
          didRecoverData = await refreshShareData("recovery");
        }
        return;
      }
      // Success closes the dialog, so any membership change missed mid-save is moot.
      missedLiveRefreshRef.current = false;
      setStagedChanges({});
      toast.success("Contributor changes saved.");
      onRequestClose();
    } catch {
      if (isCurrentRef.current) toast.error("Could not save changes.");
    } finally {
      isSavingChangesRef.current = false;
      if (isCurrentRef.current) setIsSavingChanges(false);
      if (missedLiveRefreshRef.current && isCurrentRef.current && !didRecoverData) void refreshShareData("live");
      missedLiveRefreshRef.current = false;
    }
  }
  function handleCancelChanges(): void {
    if (isSavingChangesRef.current) return;
    setStagedChanges({});
    setSaveError(null);
    onRequestClose();
  }
  // Held in a ref so the initial load re-runs only when `tripId` changes, not on every render's new
  // function identity. Updated in an effect since mutating a ref while rendering is disallowed.
  const refreshShareDataRef = useRef(refreshShareData);
  useEffect(() => {
    refreshShareDataRef.current = refreshShareData;
  });
  useEffect(() => {
    void refreshShareDataRef.current("load");
  }, [tripId]);
  return {
    ...inviteForm,
    ...invitationActions,
    collaboratorWithStagedChanges,
    data,
    handleCancelChanges,
    handleSaveChanges,
    hasPendingChanges,
    isLoading,
    isSavingChanges,
    loadError,
    recoveryWarning,
    saveError,
    stagedChanges,
    stageRemoval,
    stageRoleChange,
  };
}
