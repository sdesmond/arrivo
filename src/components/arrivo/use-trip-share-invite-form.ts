"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { inviteContributor, listInvitableUsers } from "@/app/(app)/trips/actions";
import { CollaboratorRole } from "@/data/types";
import type { InvitableUser, InvitableUsersResult } from "@/data/types";

interface UseTripShareInviteFormOptions {
  tripId: string;
  isBlocked: () => boolean;
  onInvited: () => void | Promise<void>;
}

// Shown when the directory cannot be loaded: nothing to pick, but not the "only user" message.
const LOAD_FAILED_OPTIONS: InvitableUsersResult = { users: [], hasOtherUsers: true };

export function useTripShareInviteForm({ tripId, isBlocked, onInvited }: UseTripShareInviteFormOptions) {
  const [selectedUser, setSelectedUser] = useState<InvitableUser | null>(null);
  // Null until the first load settles, so the form does not flash an empty-state message.
  const [options, setOptions] = useState<InvitableUsersResult | null>(null);
  const [role, setRole] = useState<CollaboratorRole>(CollaboratorRole.Viewer);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  // Bumped per load so only the newest response is applied when reloads overlap.
  const loadSequenceRef = useRef(0);
  const isCurrentRef = useRef(true);
  useEffect(() => {
    isCurrentRef.current = true;
    return () => {
      isCurrentRef.current = false;
    };
  }, []);

  /** Reloads the pickable users; a selection the new list no longer contains is dropped. */
  async function reloadOptions(): Promise<void> {
    const sequence = ++loadSequenceRef.current;
    const isNewest = () => isCurrentRef.current && sequence === loadSequenceRef.current;
    let nextOptions: InvitableUsersResult;
    try {
      nextOptions = await listInvitableUsers(tripId);
    } catch {
      if (!isNewest()) return;
      toast.error("Could not load users");
      nextOptions = LOAD_FAILED_OPTIONS;
    }
    if (!isNewest()) return;
    setOptions(nextOptions);
    setSelectedUser((current) =>
      current && nextOptions.users.some((user) => user.id === current.id) ? current : null
    );
  }

  function selectUser(user: InvitableUser | null): void {
    setSelectedUser(user);
    setInviteError(null);
  }

  async function handleInvite(): Promise<void> {
    if (isBlocked() || !selectedUser) return;
    setInviteLoading(true);
    setInviteError(null);
    try {
      const result = await inviteContributor(tripId, selectedUser.username, role);
      if (result.status === "error") {
        if (result.errorCode === "no-account") {
          setInviteError("No account found for this username.");
          setSelectedUser(null);
          await reloadOptions();
        } else {
          toast.error(result.message);
        }
        return;
      }
      toast.success(result.status === "resent" ? "Invitation resent." : "Invitation sent.");
      await onInvited();
      setSelectedUser(null);
      setRole(CollaboratorRole.Viewer);
    } catch (error) {
      console.error("Failed to send trip invitation", error);
      toast.error("Could not send invitation.");
    } finally {
      setInviteLoading(false);
    }
  }

  return {
    handleInvite,
    hasOtherUsers: options?.hasOtherUsers ?? true,
    inviteError,
    inviteLoading,
    invitableUsers: options?.users ?? [],
    reloadOptions,
    role,
    selectUser,
    selectedUser,
    setInviteError,
    setRole,
    usersLoaded: options !== null,
  };
}
