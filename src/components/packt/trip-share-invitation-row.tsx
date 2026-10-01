"use client";

import type { ReactElement } from "react";
import { LoaderCircle, RotateCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNow } from "@/components/providers/mock-date-provider";
import type { CollaboratorRole, Invitation } from "@/data/types";

export type InvitationRowAction = "dismiss" | "rescind" | "resend";

interface TripShareInvitationRowProps {
  invitation: Invitation;
  onDismiss: (invitation: Invitation) => void;
  onRescind: (invitation: Invitation) => void;
  onResend: (invitation: Invitation) => void;
  pendingAction: InvitationRowAction | null;
  roleLabel: (role: CollaboratorRole) => string;
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

export function TripShareInvitationRow({
  invitation,
  onDismiss,
  onRescind,
  onResend,
  pendingAction,
  roleLabel,
}: TripShareInvitationRowProps): ReactElement | null {
  const now = useNow();
  const isPending = invitation.status === "pending";
  const isDeclined = invitation.status === "declined";
  const isExpired = isPending && new Date(invitation.expiresAt).getTime() <= now.getTime();
  const isRowActionPending = pendingAction !== null;
  const isResendPending = pendingAction === "resend";
  const isRescindPending = pendingAction === "rescind";
  const isDismissPending = pendingAction === "dismiss";

  if (!isPending && !isDeclined) return null;

  return (
    <div
      className="flex items-center gap-3"
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
        <div
          className="truncate"
          title={invitation.email}
          style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--fg)" }}
        >
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
            isExpired
              ? { background: "var(--surface-3)", color: "var(--fg-3)" }
              : isPending
                ? { background: "var(--warning-soft)", color: "var(--warning-ink)" }
                : { background: "var(--surface-3)", color: "var(--fg-3)" }
          }
        >
          {isExpired ? "Expired" : isPending ? "Pending" : "Declined"}
        </span>
        {isPending ? (
          <span
            aria-label={`Invitation ${isExpired ? "expired" : "expires"} ${formatInvitationExpiry(invitation.expiresAt)}`}
            className="text-xs"
            style={{ color: "var(--fg-3)" }}
          >
            {isExpired ? "Expired" : "Expires"} {formatInvitationExpiry(invitation.expiresAt)}
          </span>
        ) : null}
      </div>
      {isPending ? (
        <div className="ml-1 flex shrink-0 items-center gap-1.5">
          <Button
            disabled={isRowActionPending}
            onClick={() => onResend(invitation)}
            size="icon-lg"
            title={`Resend invitation to ${invitation.email}`}
            variant="ghost"
          >
            {isResendPending ? (
              <LoaderCircle aria-label="Resending invitation" className="animate-spin" size={16} strokeWidth={1.5} />
            ) : (
              <RotateCw size={16} strokeWidth={1.5} />
            )}
            <span className="sr-only">Resend invitation to {invitation.email}</span>
          </Button>
          <Button
            disabled={isRowActionPending}
            onClick={() => onRescind(invitation)}
            size="icon-lg"
            title={`Rescind invitation to ${invitation.email}`}
            variant="ghost"
          >
            {isRescindPending ? (
              <LoaderCircle aria-label="Rescinding invitation" className="animate-spin" size={16} strokeWidth={1.5} />
            ) : (
              <XCircle size={16} strokeWidth={1.5} />
            )}
            <span className="sr-only">Rescind invitation to {invitation.email}</span>
          </Button>
        </div>
      ) : (
        <Button
          disabled={isRowActionPending}
          onClick={() => onDismiss(invitation)}
          size="icon-lg"
          title={`Dismiss invitation to ${invitation.email}`}
          variant="ghost"
        >
          {isDismissPending ? (
            <LoaderCircle aria-label="Dismissing invitation" className="animate-spin" size={16} strokeWidth={1.5} />
          ) : (
            <XCircle size={16} strokeWidth={1.5} />
          )}
          <span className="sr-only">Dismiss invitation to {invitation.email}</span>
        </Button>
      )}
    </div>
  );
}
