"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { inviteContributor } from "@/app/(app)/trips/actions";
import {
  dismissShareInvitation,
  getShareDialogData,
  rescindShareInvitation,
  resendShareInvitation,
} from "@/app/(app)/trips/[tripId]/actions";
import { TripShareCollaboratorRow } from "@/components/packt/trip-share-collaborator-row";
import { type InvitationRowAction, TripShareInvitationRow } from "@/components/packt/trip-share-invitation-row";
import { TripShareInviteForm } from "@/components/packt/trip-share-invite-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CollaboratorRole, type Collaborator, type Invitation } from "@/data/types";

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
}

function roleLabel(role: CollaboratorRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
function TripShareDialogContent({ tripId }: TripShareDialogContentProps): ReactElement {
  const [data, setData] = useState<ShareDialogData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CollaboratorRole>(CollaboratorRole.Viewer);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<Record<string, InvitationRowAction>>({});
  const dismissedInvitationIdsRef = useRef(new Set<string>());
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
          {data.collaborators.map((collaborator) => (
            <TripShareCollaboratorRow
              collaborator={collaborator}
              key={collaborator.id ?? collaborator.email}
              roleLabel={roleLabel}
            />
          ))}
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
    </DialogContent>
  );
}

export function TripShareDialog({ open, onOpenChange, tripId }: TripShareDialogProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <TripShareDialogContent key={tripId} tripId={tripId} /> : null}
    </Dialog>
  );
}
