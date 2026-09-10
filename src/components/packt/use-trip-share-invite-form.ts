"use client";

import { useState } from "react";
import { toast } from "sonner";
import { inviteContributor } from "@/app/(app)/trips/actions";
import { CollaboratorRole } from "@/data/types";

const EMAIL_FORMAT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface UseTripShareInviteFormOptions {
  tripId: string;
  isBlocked: () => boolean;
  onInvited: () => void | Promise<void>;
}

export function useTripShareInviteForm({ tripId, isBlocked, onInvited }: UseTripShareInviteFormOptions) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CollaboratorRole>(CollaboratorRole.Viewer);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  async function handleInvite(): Promise<void> {
    if (isBlocked() || !email.trim()) return;
    if (!EMAIL_FORMAT_PATTERN.test(email.trim())) {
      setInviteError("Enter a valid email address.");
      return;
    }
    setInviteLoading(true);
    setInviteError(null);
    try {
      const result = await inviteContributor(tripId, email, role);
      if (result.status === "error") {
        if (result.errorCode === "no-account") {
          setInviteError("No Packt account found for this email.");
        } else {
          toast.error(result.message);
        }
        return;
      }
      toast.success(result.status === "resent" ? "Invitation resent." : "Invitation sent.");
      await onInvited();
      setEmail("");
      setRole(CollaboratorRole.Viewer);
    } catch (error) {
      console.error("Failed to send trip invitation", error);
      toast.error("Could not send invitation.");
    } finally {
      setInviteLoading(false);
    }
  }

  return { email, handleInvite, inviteError, inviteLoading, role, setEmail, setInviteError, setRole };
}
