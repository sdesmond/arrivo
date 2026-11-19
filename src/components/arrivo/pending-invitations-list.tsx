"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { acceptInvitation, declineInvitation } from "@/lib/api/contract/sharing";
import { createRandomId } from "@/lib/utils";
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

function decisionErrorMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) return "Could not save changes. Try again.";
  return error.status === 404 ? "Invitation not found." : error.message;
}

export function PendingInvitationsList({ invitations }: PendingInvitationsListProps) {
  const router = useRouter();
  // Props stay the source of truth so a live refresh can add or drop rows; declines are layered on
  // top until the refreshed props stop returning them.
  const [declinedIds, setDeclinedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [, startTransition] = useTransition();
  const keys = useRef(new Map<string, string>());
  const active = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const items = invitations.filter((invitation) => !declinedIds.has(invitation.id));

  if (items.length === 0) {
    return null;
  }

  function handleDecision(invitation: PendingInvitation, decision: "accept" | "decline") {
    if (active.current.has(invitation.id)) return;
    active.current.add(invitation.id);
    const keyId = `${invitation.id}:${decision}`;
    const idempotencyKey = keys.current.get(keyId) ?? createRandomId();
    keys.current.set(keyId, idempotencyKey);
    setPendingIds((current) => new Set(current).add(invitation.id));
    startTransition(async () => {
      try {
        const request = () =>
          decision === "accept"
            ? api(acceptInvitation, { params: { invitationId: invitation.id }, body: {}, idempotencyKey })
            : api(declineInvitation, { params: { invitationId: invitation.id }, body: {}, idempotencyKey });
        let result;
        try {
          result = await request();
        } catch (error) {
          const uncertain =
            !(error instanceof ApiClientError) ||
            error.status === 0 ||
            error.status === 408 ||
            error.status >= 500 ||
            (error.status >= 200 && error.status < 300);
          if (!uncertain || !mounted.current) throw error;
          result = await request();
        }
        keys.current.delete(keyId);
        if (!mounted.current) return;
        if (result.status === "accepted") router.push(`/trips/${result.tripId}`);
        else setDeclinedIds((current) => new Set(current).add(invitation.id));
      } catch (error) {
        if (error instanceof ApiClientError && error.status >= 400 && error.status < 500 && error.status !== 408)
          keys.current.delete(keyId);
        if (mounted.current) toast.error(decisionErrorMessage(error));
      } finally {
        active.current.delete(invitation.id);
        if (mounted.current)
          setPendingIds((current) => {
            const next = new Set(current);
            next.delete(invitation.id);
            return next;
          });
      }
    });
  }

  return (
    <section aria-label="Pending invitations" className="px-4 pt-4 lg:px-6 lg:pt-6" style={{ maxWidth: 1200 }}>
      <SectionHead title="Invitations" count={String(items.length)} />
      <ul className="flex flex-col gap-2">
        {items.map((invitation) => {
          const isRowPending = pendingIds.has(invitation.id);
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
                  onClick={() => handleDecision(invitation, "accept")}
                >
                  Accept
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 px-4"
                  disabled={isRowPending}
                  title={`Decline invitation to ${invitation.tripName}`}
                  onClick={() => handleDecision(invitation, "decline")}
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
