"use client";

import { useEffect, useState, type ReactElement } from "react";
import { LoaderCircle, Lock, RotateCw, UserPlus, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { inviteContributor } from "@/app/(app)/trips/actions";
import { getShareDialogData, rescindShareInvitation, resendShareInvitation } from "@/app/(app)/trips/[tripId]/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  onOpenChange: (open: boolean) => void;
}

function roleLabel(role: CollaboratorRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function roleStyle(role: CollaboratorRole): { background: string; color: string } {
  if (role === CollaboratorRole.Manager) {
    return { background: "var(--accent-soft)", color: "var(--accent-ink)" };
  }

  return { background: "var(--surface-2)", color: "var(--fg-2)" };
}

function formatInvitationExpiry(expiresAt: string): string {
  return new Date(expiresAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type PendingInvitationAction = { invitationId: string; action: "resend" | "rescind" };

function TripShareDialogContent({ tripId, onOpenChange }: TripShareDialogContentProps): ReactElement {
  const [data, setData] = useState<ShareDialogData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CollaboratorRole>(CollaboratorRole.Viewer);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingInvitationAction | null>(null);

  async function handleInvite(): Promise<void> {
    if (!email.trim()) return;
    setInviteLoading(true);
    setInviteError(null);
    try {
      const result = await inviteContributor(tripId, email, role);
      if (result.status === "error") {
        const message = result.message;
        if (message === "No Packt account found for this email") {
          setInviteError("No Packt account found for this email.");
        } else {
          toast.error(message);
        }
        return;
      }
      toast.success(result.status === "resent" ? "Invitation resent." : "Invitation sent.");
      try {
        const refreshedData = await getShareDialogData(tripId);
        setData(refreshedData);
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
    setPendingAction({ invitationId: invitation.id, action: "resend" });
    try {
      const result = await resendShareInvitation(tripId, invitation.id);
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      const { expiresAt } = result;
      setData((currentData) =>
        currentData
          ? {
              ...currentData,
              invitations: currentData.invitations.map((currentInvitation) =>
                currentInvitation.id === invitation.id ? { ...currentInvitation, expiresAt } : currentInvitation
              ),
            }
          : currentData
      );
      toast.success("Invitation resent.");
    } catch {
      toast.error("Could not resend invitation.");
    } finally {
      setPendingAction(null);
    }
  }

  async function rescindPendingInvitation(invitation: Invitation): Promise<void> {
    setPendingAction({ invitationId: invitation.id, action: "rescind" });
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
      setPendingAction(null);
    }
  }

  useEffect(() => {
    if (!open) return;

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

      <div
        className="flex flex-col gap-2"
        style={{ padding: "10px", border: "1px dashed var(--line-strong)", borderRadius: 8 }}
      >
        <span style={{ color: "var(--fg)", fontWeight: 500 }}>Invite person</span>
        <Input
          aria-label="Invite email"
          className="h-11"
          disabled={inviteLoading}
          onChange={(event) => {
            setEmail(event.target.value);
            setInviteError(null);
          }}
          placeholder="Email"
          type="email"
          value={email}
        />
        {inviteError ? (
          <p role="alert" style={{ color: "var(--danger)", fontSize: "calc(12px * var(--font-scale))" }}>
            {inviteError}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <Select value={role} onValueChange={(value) => setRole(value as CollaboratorRole)} disabled={inviteLoading}>
            <SelectTrigger aria-label="Invite role" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CollaboratorRole.Manager}>Manager</SelectItem>
              <SelectItem value={CollaboratorRole.Editor}>Editor</SelectItem>
              <SelectItem value={CollaboratorRole.Viewer}>Viewer</SelectItem>
            </SelectContent>
          </Select>
          <Button
            className="h-11"
            disabled={inviteLoading}
            onClick={() => void handleInvite()}
            size="sm"
            title="Invite this person to the trip"
            variant="outline"
          >
            {inviteLoading ? (
              <LoaderCircle aria-label="Sending invitation" className="animate-spin" size={16} strokeWidth={1.5} />
            ) : (
              <UserPlus size={16} strokeWidth={1.5} />
            )}
            Invite
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p aria-label="Loading sharing details" role="status" style={{ color: "var(--fg-3)" }}>
          Loading sharing details…
        </p>
      ) : null}
      {loadError ? <p style={{ color: "var(--fg-3)" }}>Could not load collaborators and invitations.</p> : null}

      {data ? (
        <div className="flex flex-col gap-2">
          {data.collaborators.map((collaborator) => (
            <div
              className="flex items-center gap-2"
              key={collaborator.id ?? collaborator.email}
              style={{ padding: "6px 8px", borderRadius: 8, background: "var(--surface-2)" }}
            >
              <span
                className="flex shrink-0 items-center justify-center rounded-full"
                style={{
                  width: 28,
                  height: 28,
                  fontSize: "calc(10px * var(--font-scale))",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  background: collaborator.tint?.bg ?? "var(--accent-soft)",
                  color: collaborator.tint?.fg ?? "var(--accent-ink)",
                }}
              >
                {collaborator.initials}
              </span>
              <div className="min-w-0 flex-1">
                <div style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 500, color: "var(--fg)" }}>
                  {collaborator.name}
                </div>
                <div style={{ fontSize: "calc(11.5px * var(--font-scale))", color: "var(--fg-3)" }}>
                  {collaborator.email}
                </div>
              </div>
              {collaborator.isCreator ? (
                <span
                  aria-label="Trip creator — access can't be changed"
                  className="flex size-11 shrink-0 items-center justify-center"
                  style={{ color: "var(--fg-4)" }}
                >
                  <Lock size={16} strokeWidth={1.5} />
                </span>
              ) : (
                <span
                  className="inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium"
                  style={roleStyle(collaborator.role)}
                >
                  {roleLabel(collaborator.role)}
                </span>
              )}
            </div>
          ))}

          {data.invitations.map((invitation) => {
            const isPending = invitation.status === "pending";
            const isRowActionPending = pendingAction?.invitationId === invitation.id;
            const isResendPending = isRowActionPending && pendingAction?.action === "resend";
            const isRescindPending = isRowActionPending && pendingAction?.action === "rescind";
            return (
              <div
                className="flex items-center gap-3"
                key={invitation.id}
                style={{ padding: "12px", borderRadius: 8, background: "var(--surface-2)" }}
              >
                <span
                  className="flex shrink-0 items-center justify-center rounded-full"
                  style={{
                    width: 28,
                    height: 28,
                    fontSize: "calc(10px * var(--font-scale))",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    background: "var(--accent-soft)",
                    color: "var(--accent-ink)",
                  }}
                >
                  {invitation.email.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--fg)" }}>
                    {invitation.email}
                  </div>
                  <div style={{ fontSize: "calc(11.5px * var(--font-scale))", color: "var(--fg-3)" }}>
                    {roleLabel(invitation.role)} access
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className="inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium"
                    style={
                      isPending
                        ? { background: "var(--warning-soft)", color: "var(--warning-ink)" }
                        : { background: "var(--surface-3)", color: "var(--fg-3)" }
                    }
                  >
                    {isPending ? "Pending" : "Declined"}
                  </span>
                  {isPending ? (
                    <span
                      aria-label={`Invitation expires ${formatInvitationExpiry(invitation.expiresAt)}`}
                      className="text-xs"
                      style={{ color: "var(--fg-3)" }}
                    >
                      Expires {formatInvitationExpiry(invitation.expiresAt)}
                    </span>
                  ) : null}
                </div>
                {isPending ? (
                  <div className="ml-1 flex shrink-0 items-center gap-1.5">
                    <Button
                      disabled={isRowActionPending}
                      onClick={() => void resendPendingInvitation(invitation)}
                      size="icon-lg"
                      title={`Resend invitation to ${invitation.email}`}
                      variant="ghost"
                    >
                      {isResendPending ? (
                        <LoaderCircle
                          aria-label="Resending invitation"
                          className="animate-spin"
                          size={16}
                          strokeWidth={1.5}
                        />
                      ) : (
                        <RotateCw size={16} strokeWidth={1.5} />
                      )}
                      <span className="sr-only">Resend invitation to {invitation.email}</span>
                    </Button>
                    <Button
                      disabled={isRowActionPending}
                      onClick={() => void rescindPendingInvitation(invitation)}
                      size="icon-lg"
                      title={`Rescind invitation to ${invitation.email}`}
                      variant="ghost"
                    >
                      {isRescindPending ? (
                        <LoaderCircle
                          aria-label="Rescinding invitation"
                          className="animate-spin"
                          size={16}
                          strokeWidth={1.5}
                        />
                      ) : (
                        <XCircle size={16} strokeWidth={1.5} />
                      )}
                      <span className="sr-only">Rescind invitation to {invitation.email}</span>
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </DialogContent>
  );
}

export function TripShareDialog({ open, onOpenChange, tripId }: TripShareDialogProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <TripShareDialogContent key={tripId} tripId={tripId} onOpenChange={onOpenChange} /> : null}
    </Dialog>
  );
}
