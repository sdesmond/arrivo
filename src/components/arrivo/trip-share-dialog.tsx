"use client";

import type { ReactElement } from "react";
import type { DialogRoot } from "@base-ui/react/dialog";
import { LoaderCircle, X } from "lucide-react";
import { TripShareCollaboratorRow } from "@/components/arrivo/trip-share-collaborator-row";
import { TripShareInvitationRow } from "@/components/arrivo/trip-share-invitation-row";
import { TripShareInviteForm } from "@/components/arrivo/trip-share-invite-form";
import { useTripShareDialogController } from "@/components/arrivo/use-trip-share-dialog-controller";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CollaboratorRole } from "@/data/types";

interface TripShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
}

interface TripShareDialogContentProps {
  tripId: string;
  onRequestClose: () => void;
}

function roleLabel(role: CollaboratorRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function isDismissalPress(reason: DialogRoot.ChangeEventReason): boolean {
  return reason === "outside-press" || reason === "escape-key";
}

function TripShareDialogContent({ tripId, onRequestClose }: TripShareDialogContentProps): ReactElement {
  const controller = useTripShareDialogController({ onRequestClose, tripId });

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
        disabled={controller.isSavingChanges}
        title="Close sharing dialog"
        render={
          <Button className="absolute top-2 right-2" size="icon-lg" title="Close sharing dialog" variant="ghost" />
        }
      >
        <X size={18} strokeWidth={1.5} />
        <span className="sr-only">Close sharing dialog</span>
      </DialogClose>

      <TripShareInviteForm
        disabled={controller.isSavingChanges}
        username={controller.username}
        error={controller.inviteError}
        isLoading={controller.inviteLoading}
        onUsernameChange={(username) => {
          controller.setUsername(username);
          controller.setInviteError(null);
        }}
        onInvite={() => void controller.handleInvite()}
        onRoleChange={controller.setRole}
        role={controller.role}
      />

      {controller.isLoading ? (
        <p aria-label="Loading sharing details" role="status" style={{ color: "var(--fg-3)" }}>
          Loading sharing details…
        </p>
      ) : null}
      {controller.loadError ? (
        <p style={{ color: "var(--fg-3)" }}>Could not load collaborators and invitations.</p>
      ) : null}

      {controller.data ? (
        <div className="flex flex-col gap-2">
          {controller.data.collaborators.map((collaborator) => {
            const staged = collaborator.id ? controller.stagedChanges[collaborator.id] : undefined;
            const pendingRemoval = staged?.type === "remove";
            return (
              <div key={collaborator.id ?? collaborator.name} style={{ opacity: pendingRemoval ? 0.5 : 1 }}>
                <TripShareCollaboratorRow
                  collaborator={controller.collaboratorWithStagedChanges(collaborator)}
                  disabled={pendingRemoval || controller.isSavingChanges}
                  isCurrentUser={collaborator.id === controller.data?.currentCollaboratorId}
                  onRemove={controller.stageRemoval}
                  onRoleChange={controller.stageRoleChange}
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
          {controller.data.invitations.map((invitation) => (
            <TripShareInvitationRow
              invitation={invitation}
              key={invitation.id}
              onDismiss={(currentInvitation) => void controller.dismissDeclinedInvitation(currentInvitation)}
              onRescind={(currentInvitation) => void controller.rescindPendingInvitation(currentInvitation)}
              onResend={(currentInvitation) => void controller.resendPendingInvitation(currentInvitation)}
              pendingAction={controller.pendingActions[invitation.id] ?? null}
              roleLabel={roleLabel}
            />
          ))}
        </div>
      ) : null}

      {controller.saveError ? (
        <p role="alert" style={{ color: "var(--danger)" }}>
          {controller.saveError}
        </p>
      ) : null}
      {controller.recoveryWarning ? (
        <p role="status" style={{ color: "var(--warning)" }}>
          {controller.recoveryWarning}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2" style={{ paddingTop: "8px" }}>
        <Button
          className="h-11"
          disabled={controller.isSavingChanges}
          onClick={controller.handleCancelChanges}
          variant="ghost"
        >
          Cancel
        </Button>
        <Button
          className="h-11"
          disabled={controller.isSavingChanges || !controller.hasPendingChanges}
          onClick={() => void controller.handleSaveChanges()}
        >
          {controller.isSavingChanges ? (
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
