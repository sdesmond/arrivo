"use client";

import { useState, type ReactElement } from "react";
import Link from "next/link";
import { LoaderCircle, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CollaboratorRole } from "@/data/types";
import type { InvitableUser } from "@/data/types";

interface TripShareInviteFormProps {
  disabled?: boolean;
  error: string | null;
  /** Any account besides the caller exists, even if none can be invited to this trip. */
  hasOtherUsers: boolean;
  isLoading: boolean;
  onInvite: () => void;
  onRoleChange: (role: CollaboratorRole) => void;
  onUserChange: (user: InvitableUser | null) => void;
  role: CollaboratorRole;
  selectedUser: InvitableUser | null;
  users: InvitableUser[];
  /** False until the first list load settles; the picker waits rather than flashing an empty state. */
  usersLoaded: boolean;
}

const ERROR_ID = "invite-username-error";
const HINT_ID = "invite-username-hint";
const HINT_STYLE = { color: "var(--fg-3)", fontSize: "calc(12px * var(--font-scale))" };

export function TripShareInviteForm({
  disabled = false,
  error,
  hasOtherUsers,
  isLoading,
  onInvite,
  onRoleChange,
  onUserChange,
  role,
  selectedUser,
  users,
  usersLoaded,
}: TripShareInviteFormProps): ReactElement {
  const controlsDisabled = disabled || isLoading;
  // The text mirrors the selection: picking fills it, and clearing the pick (after an invite) empties it.
  // Text the person typed away from the pick is theirs to keep.
  const [inputValue, setInputValue] = useState(selectedUser?.username ?? "");
  const [previousSelectedUser, setPreviousSelectedUser] = useState(selectedUser);
  if (previousSelectedUser !== selectedUser) {
    setPreviousSelectedUser(selectedUser);
    if (selectedUser) setInputValue(selectedUser.username);
    else if (inputValue === previousSelectedUser?.username) setInputValue("");
  }
  const nobodyToPick = usersLoaded && users.length === 0;
  const describedBy = [error ? ERROR_ID : null, nobodyToPick ? HINT_ID : null].filter(Boolean).join(" ");

  return (
    <div
      className="flex flex-col gap-2"
      style={{ padding: "10px", border: "1px dashed var(--line-strong)", borderRadius: 8 }}
    >
      <span style={{ color: "var(--fg)", fontWeight: 500 }}>Invite person</span>
      <div className="flex items-center gap-2">
        <Combobox
          inputValue={inputValue}
          onInputValueChange={(text, details) => {
            setInputValue(text);
            // Typing away from the picked name drops the pick, so Invite never targets a user the field no longer shows.
            if (selectedUser && details.reason === "input-change" && text !== selectedUser.username) onUserChange(null);
          }}
          disabled={controlsDisabled || !usersLoaded || nobodyToPick}
          isItemEqualToValue={(item, value) => item.id === value.id}
          items={users}
          itemToStringLabel={(item) => item.username}
          onValueChange={(user) => onUserChange(user)}
          value={selectedUser}
        >
          <div className="min-w-0 flex-1">
            <ComboboxInput
              aria-describedby={describedBy || undefined}
              aria-label="Invite username"
              autoCapitalize="none"
              className="h-11"
              placeholder="Username"
              spellCheck={false}
            />
          </div>
          <ComboboxContent>
            <ComboboxEmpty>No registered users found</ComboboxEmpty>
            <ComboboxList>
              {(user: InvitableUser) => (
                <ComboboxItem key={user.id} value={user}>
                  {user.username}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <Select
          value={role}
          onValueChange={(value) => onRoleChange(value as CollaboratorRole)}
          disabled={controlsDisabled}
        >
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
          disabled={controlsDisabled || !selectedUser}
          onClick={onInvite}
          size="sm"
          title="Invite this person to the trip"
          variant="outline"
        >
          {isLoading ? (
            <LoaderCircle aria-label="Sending invitation" className="animate-spin" size={16} strokeWidth={1.5} />
          ) : (
            <UserPlus size={16} strokeWidth={1.5} />
          )}
          Invite
        </Button>
      </div>
      {nobodyToPick ? (
        <p id={HINT_ID} style={HINT_STYLE}>
          {hasOtherUsers ? (
            "No registered users available to invite."
          ) : (
            <>
              You are the only user, you can add more from the{" "}
              <Link
                className="inline-flex min-h-11 items-center underline"
                href="/admin/users"
                style={{ color: "var(--accent-brand)" }}
              >
                Users screen
              </Link>
              .
            </>
          )}
        </p>
      ) : null}
      {error ? (
        <p id={ERROR_ID} role="alert" style={{ color: "var(--danger)", fontSize: "calc(12px * var(--font-scale))" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
