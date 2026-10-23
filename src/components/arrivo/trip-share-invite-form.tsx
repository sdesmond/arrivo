"use client";

import type { ReactElement } from "react";
import { LoaderCircle, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CollaboratorRole } from "@/data/types";

interface TripShareInviteFormProps {
  disabled?: boolean;
  username: string;
  error: string | null;
  isLoading: boolean;
  onUsernameChange: (username: string) => void;
  onInvite: () => void;
  onRoleChange: (role: CollaboratorRole) => void;
  role: CollaboratorRole;
}

export function TripShareInviteForm({
  disabled = false,
  username,
  error,
  isLoading,
  onUsernameChange,
  onInvite,
  onRoleChange,
  role,
}: TripShareInviteFormProps): ReactElement {
  const controlsDisabled = disabled || isLoading;

  return (
    <div
      className="flex flex-col gap-2"
      style={{ padding: "10px", border: "1px dashed var(--line-strong)", borderRadius: 8 }}
    >
      <span style={{ color: "var(--fg)", fontWeight: 500 }}>Invite person</span>
      <Input
        aria-label="Invite username"
        aria-describedby={error ? "invite-username-error" : undefined}
        autoCapitalize="none"
        className="h-11"
        disabled={controlsDisabled}
        onChange={(event) => onUsernameChange(event.target.value)}
        placeholder="Username"
        spellCheck={false}
        type="text"
        value={username}
      />
      {error ? (
        <p
          id="invite-username-error"
          role="alert"
          style={{ color: "var(--danger)", fontSize: "calc(12px * var(--font-scale))" }}
        >
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
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
          disabled={controlsDisabled}
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
    </div>
  );
}
