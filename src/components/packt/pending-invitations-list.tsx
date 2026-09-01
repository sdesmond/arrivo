"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { acceptInvitation, declineInvitation } from "@/app/(app)/trips/actions";
import { Button } from "@/components/ui/button";
import { SectionHead } from "./trips-section-head";
import type { CollaboratorRole, PendingInvitation } from "@/data/types";

export interface PendingInvitationsListProps {
  invitations: PendingInvitation[];
}

const ROLE_LABELS: Record<CollaboratorRole, string> = {
  manager: "Manager",
  editor: "Editor",
  viewer: "Viewer",
};

export function PendingInvitationsList({ invitations }: PendingInvitationsListProps) {
  const router = useRouter();
  const [items, setItems] = useState(invitations);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (items.length === 0) {
    return null;
  }

  function handleAccept(invitation: PendingInvitation) {
    setPendingId(invitation.id);
    startTransition(async () => {
      const result = await acceptInvitation(invitation.id);
      if (result.status === "accepted") {
        router.push(`/trips/${result.tripId}`);
        return;
      }
      setPendingId(null);
      toast.error(result.message);
    });
  }

  function handleDecline(invitation: PendingInvitation) {
    setPendingId(invitation.id);
    startTransition(async () => {
      const result = await declineInvitation(invitation.id);
      setPendingId(null);
      if (result.status === "declined") {
        setItems((current) => current.filter((item) => item.id !== invitation.id));
        toast.success("Invitation declined.");
        return;
      }
      toast.error(result.message);
    });
  }

  return (
    <section aria-label="Pending invitations" className="px-4 pt-4 lg:px-6 lg:pt-6" style={{ maxWidth: 1200 }}>
      <SectionHead title="Invitations" count={String(items.length)} />
      <ul className="flex flex-col gap-2">
        {items.map((invitation) => {
          const isRowPending = pendingId === invitation.id;
          return (
            <li
              key={invitation.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
              style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="font-medium truncate" style={{ color: "var(--fg)" }}>
                  {invitation.tripName}
                </span>
                <span style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--fg-3)" }}>
                  Invited by {invitation.inviterName}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-full px-2 py-1"
                    style={{
                      background: "var(--surface)",
                      color: "var(--fg-2)",
                      fontSize: "calc(12px * var(--font-scale))",
                    }}
                  >
                    {ROLE_LABELS[invitation.role]}
                  </span>
                  <span
                    className="rounded-full px-2 py-1"
                    style={{
                      background: "var(--warning-soft)",
                      color: "var(--warning-ink)",
                      fontSize: "calc(12px * var(--font-scale))",
                    }}
                  >
                    Pending
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  className="h-11 px-4"
                  disabled={isRowPending}
                  title={`Accept invitation to ${invitation.tripName}`}
                  onClick={() => handleAccept(invitation)}
                >
                  Accept
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 px-4"
                  disabled={isRowPending}
                  title={`Decline invitation to ${invitation.tripName}`}
                  onClick={() => handleDecline(invitation)}
                >
                  Decline
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
