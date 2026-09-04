"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import type { DialogRoot } from "@base-ui/react/dialog";
import { LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";
import { inviteContributor } from "@/app/(app)/trips/actions";
import {
  dismissShareInvitation,
  getShareDialogData,
  rescindShareInvitation,
  resendShareInvitation,
  saveContributorChanges,
} from "@/app/(app)/trips/[tripId]/actions";
import { TripShareCollaboratorRow } from "@/components/packt/trip-share-collaborator-row";
import { type InvitationRowAction, TripShareInvitationRow } from "@/components/packt/trip-share-invitation-row";
import { TripShareInviteForm } from "@/components/packt/trip-share-invite-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CollaboratorRole, type Collaborator, type ContributorChange, type Invitation } from "@/data/types";

interface TripShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
}

interface ShareDialogData {
  collaborators: Collaborator[];
  invitations: Invitation[];
}

interface TripShareDialogContentProps {
  tripId: string;
  onRequestClose: () => void;
}

function roleLabel(role: CollaboratorRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/** True for backdrop-click ("outside-press") and Esc ("escape-key") — the two dismissal
 * reasons `handleOpenChange` below treats as a no-op, leaving Save/Cancel/X as the only
 * ways to close. */
export function isDismissalPress(reason: DialogRoot.ChangeEventReason): boolean {
  return reason === "outside-press" || reason === "escape-key";
}

function TripShareDialogContent({ tripId, onRequestClose }: TripShareDialogContentProps): ReactElement {
  const [data, setData] = useState<ShareDialogData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CollaboratorRole>(CollaboratorRole.Viewer);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<Record<string, InvitationRowAction>>({});
  const dismissedInvitationIdsRef = useRef(new Set<string>());
  const [stagedChanges, setStagedChanges] = useState<Record<string, ContributorChange>>({});
  const [isSavingChanges, setIsSavingChanges] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const hasPendingChanges = Object.keys(stagedChanges).length > 0;

  function stageRoleChange(collaborator: Collaborator, role: CollaboratorRole): void {
    const collaboratorId = collaborator.id;
    if (!collaboratorId) return;
    const originalCollaborator = data?.collaborators.find((item) => item.id === collaboratorId);
    const fromRole = originalCollaborator?.role ?? collaborator.role;
    setStagedChanges((currentChanges) => ({
      ...currentChanges,
      [collaboratorId]: {
        type: "role",
        collaboratorId,
        fromRole,
        toRole: role,
      },
    }));
    setSaveError(null);
  }

  function stageRemoval(collaborator: Collaborator): void {
    const collaboratorId = collaborator.id;
    if (!collaboratorId) return;
    setStagedChanges((currentChanges) => ({
      ...currentChanges,
      [collaboratorId]: { type: "remove", collaboratorId },
    }));
    setSaveError(null);
  }

  async function handleSaveChanges(): Promise<void> {
    const changes = Object.values(stagedChanges);
    if (changes.length === 0) return;
    setIsSavingChanges(true);
    setSaveError(null);
    try {
      const result = await saveContributorChanges(tripId, changes);
      if (result.status === "error") {
        setSaveError(result.message);
        if (result.stale) {
          setStagedChanges({});
          try {
            const refreshedData = await getShareDialogData(tripId);
            setData({
              ...refreshedData,
              invitations: refreshedData.invitations.filter(
                (invitation) => !dismissedInvitationIdsRef.current.has(invitation.id)
              ),
            });
            setLoadError(false);
          } catch {
            // Save already failed with a specific message above; a failed refresh has nothing to add.
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
      setIsSavingChanges(false);
    }
  }

  function handleCancelChanges(): void {
    setStagedChanges({});
    setSaveError(null);
    onRequestClose();
  }

  function collaboratorWithStagedChanges(collaborator: Collaborator): Collaborator {
    const staged = collaborator.id ? stagedChanges[collaborator.id] : undefined;
    if (staged && staged.type === "role") {
      return { ...collaborator, role: staged.toRole };
    }
    return collaborator;
  }
  async function handleInvite(): Promise<void> {
    if (!email.trim()) return;
    setInviteLoading(true);
    setInviteError(null);
    try {
      const result = await inviteContributor(tripId, email, role);
      if (result.status === "error") {
        if (result.message === "No Packt account found for this email") {
          setInviteError("No Packt account found for this email.");
        } else {
          toast.error(result.message);
        }
        return;
      }
      toast.success(result.status === "resent" ? "Invitation resent." : "Invitation sent.");
      try {
        const refreshedData = await getShareDialogData(tripId);
        setData({
          ...refreshedData,
          invitations: refreshedData.invitations.filter(
            (invitation) => !dismissedInvitationIdsRef.current.has(invitation.id)
          ),
        });
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
  async function resendPendingInvitation(invitation: Invitation): Promise<void> {
    setPendingActions((currentActions) => ({ ...currentActions, [invitation.id]: "resend" }));
    try {
      const result = await resendShareInvitation(tripId, invitation.id);
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      setData((currentData) =>
        currentData
          ? {
              ...currentData,
              invitations: currentData.invitations.map((currentInvitation) =>
                currentInvitation.id === invitation.id
                  ? { ...currentInvitation, expiresAt: result.expiresAt }
                  : currentInvitation
              ),
            }
          : currentData
      );
      toast.success("Invitation resent.");
    } catch {
      toast.error("Could not resend invitation.");
    } finally {
      setPendingActions((currentActions) => {
        const nextActions = { ...currentActions };
        delete nextActions[invitation.id];
        return nextActions;
      });
    }
  }
  async function rescindPendingInvitation(invitation: Invitation): Promise<void> {
    setPendingActions((currentActions) => ({ ...currentActions, [invitation.id]: "rescind" }));
    try {
      const result = await rescindShareInvitation(tripId, invitation.id);
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      setData((currentData) =>
        currentData
          ? {
              ...currentData,
              invitations: currentData.invitations.filter(
                (currentInvitation) => currentInvitation.id !== invitation.id
              ),
            }
          : currentData
      );
      toast.success("Invitation rescinded.");
    } catch {
      toast.error("Could not rescind invitation.");
    } finally {
      setPendingActions((currentActions) => {
        const nextActions = { ...currentActions };
        delete nextActions[invitation.id];
        return nextActions;
      });
    }
  }
  async function dismissDeclinedInvitation(invitation: Invitation): Promise<void> {
    setPendingActions((currentActions) => ({ ...currentActions, [invitation.id]: "dismiss" }));
    try {
      const result = await dismissShareInvitation(tripId, invitation.id);
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      dismissedInvitationIdsRef.current.add(invitation.id);
      setData((currentData) =>
        currentData
          ? {
              ...currentData,
              invitations: currentData.invitations.filter(
                (currentInvitation) => currentInvitation.id !== invitation.id
              ),
            }
          : currentData
      );
      toast.success("Invitation dismissed.");
    } catch {
      toast.error("Could not dismiss invitation.");
    } finally {
      setPendingActions((currentActions) => {
        const nextActions = { ...currentActions };
        delete nextActions[invitation.id];
        return nextActions;
      });
    }
  }

  useEffect(() => {
    let isCurrent = true;

    async function loadData(): Promise<void> {
      try {
        const nextData = await getShareDialogData(tripId);
        if (isCurrent) {
          setData(nextData);
          setLoadError(false);
        }
      } catch {
        if (isCurrent) {
          setData(null);
          setLoadError(true);
          toast.error("Could not load sharing details");
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    void loadData();
    return () => {
      isCurrent = false;
    };
  }, [tripId]);

  return (
    <DialogContent
      showCloseButton={false}
      className="overflow-y-auto sm:max-w-lg"
      style={{ maxHeight: "min(42rem, calc(100% - 2rem))" }}
    >
      <DialogHeader className="pr-12">
        <DialogTitle>Share trip</DialogTitle>
      </DialogHeader>

      <DialogClose
        disabled={isSavingChanges}
        title="Close sharing dialog"
        render={
          <Button className="absolute top-2 right-2" size="icon-lg" title="Close sharing dialog" variant="ghost" />
        }
      >
        <X size={18} strokeWidth={1.5} />
        <span className="sr-only">Close sharing dialog</span>
      </DialogClose>

      <TripShareInviteForm
        email={email}
        error={inviteError}
        isLoading={inviteLoading}
        onEmailChange={(nextEmail) => {
          setEmail(nextEmail);
          setInviteError(null);
        }}
        onInvite={() => void handleInvite()}
        onRoleChange={setRole}
        role={role}
      />

      {isLoading ? (
        <p aria-label="Loading sharing details" role="status" style={{ color: "var(--fg-3)" }}>
          Loading sharing details…
        </p>
      ) : null}
      {loadError ? <p style={{ color: "var(--fg-3)" }}>Could not load collaborators and invitations.</p> : null}

      {data ? (
        <div className="flex flex-col gap-2">
          {data.collaborators.map((collaborator) => {
            const staged = collaborator.id ? stagedChanges[collaborator.id] : undefined;
            const pendingRemoval = staged?.type === "remove";
            return (
              <div key={collaborator.id ?? collaborator.email} style={{ opacity: pendingRemoval ? 0.5 : 1 }}>
                <TripShareCollaboratorRow
                  collaborator={collaboratorWithStagedChanges(collaborator)}
                  onRemove={stageRemoval}
                  onRoleChange={stageRoleChange}
                  roleLabel={roleLabel}
                />
                {pendingRemoval ? (
                  <p
                    aria-label={`${collaborator.name} will be removed`}
                    style={{ color: "var(--danger)", fontSize: "calc(12px * var(--font-scale))" }}
                  >
                    Will be removed on Save
                  </p>
                ) : null}
              </div>
            );
          })}
          {data.invitations.map((invitation) => (
            <TripShareInvitationRow
              invitation={invitation}
              key={invitation.id}
              onDismiss={(currentInvitation) => void dismissDeclinedInvitation(currentInvitation)}
              onRescind={(currentInvitation) => void rescindPendingInvitation(currentInvitation)}
              onResend={(currentInvitation) => void resendPendingInvitation(currentInvitation)}
              pendingAction={pendingActions[invitation.id] ?? null}
              roleLabel={roleLabel}
            />
          ))}
        </div>
      ) : null}

      {saveError ? (
        <p role="alert" style={{ color: "var(--danger)" }}>
          {saveError}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2" style={{ paddingTop: "8px" }}>
        <Button className="h-11" disabled={isSavingChanges} onClick={handleCancelChanges} variant="ghost">
          Cancel
        </Button>
        <Button
          className="h-11"
          disabled={isSavingChanges || !hasPendingChanges}
          onClick={() => void handleSaveChanges()}
        >
          {isSavingChanges ? (
            <LoaderCircle aria-label="Saving changes" className="animate-spin" size={16} strokeWidth={1.5} />
          ) : null}
          Save
        </Button>
      </div>
    </DialogContent>
  );
}

export function TripShareDialog({ open, onOpenChange, tripId }: TripShareDialogProps): ReactElement {
  function handleOpenChange(nextOpen: boolean, eventDetails: DialogRoot.ChangeEventDetails): void {
    if (!nextOpen && isDismissalPress(eventDetails.reason)) {
      eventDetails.preventUnmountOnClose();
      return;
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {open ? <TripShareDialogContent key={tripId} onRequestClose={() => onOpenChange(false)} tripId={tripId} /> : null}
    </Dialog>
  );
}
