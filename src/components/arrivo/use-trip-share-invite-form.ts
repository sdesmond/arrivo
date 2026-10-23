"use client";

import { useState } from "react";
import { toast } from "sonner";
import { inviteContributor } from "@/app/(app)/trips/actions";
import { CollaboratorRole } from "@/data/types";
import { validateUsername } from "@/lib/username";

interface UseTripShareInviteFormOptions {
  tripId: string;
  isBlocked: () => boolean;
  onInvited: () => void | Promise<void>;
}

export function useTripShareInviteForm({ tripId, isBlocked, onInvited }: UseTripShareInviteFormOptions) {
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<CollaboratorRole>(CollaboratorRole.Viewer);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  async function handleInvite(): Promise<void> {
    if (isBlocked() || !username.trim()) return;
    const usernameError = validateUsername(username);
    if (usernameError) {
      setInviteError(usernameError);
      return;
    }
    setInviteLoading(true);
    setInviteError(null);
    try {
      const result = await inviteContributor(tripId, username, role);
      if (result.status === "error") {
        if (result.errorCode === "no-account") {
          setInviteError("No account found for this username.");
        } else {
          toast.error(result.message);
        }
        return;
      }
      toast.success(result.status === "resent" ? "Invitation resent." : "Invitation sent.");
      await onInvited();
      setUsername("");
      setRole(CollaboratorRole.Viewer);
    } catch (error) {
      console.error("Failed to send trip invitation", error);
      toast.error("Could not send invitation.");
    } finally {
      setInviteLoading(false);
    }
  }

  return { username, handleInvite, inviteError, inviteLoading, role, setUsername, setInviteError, setRole };
}
