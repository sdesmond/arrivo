"use client";

import type { ReactElement } from "react";
import { Lock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CollaboratorRole, type Collaborator, type CollaboratorRole as CollaboratorRoleValue } from "@/data/types";

interface TripShareCollaboratorRowProps {
  collaborator: Collaborator;
  isCurrentUser?: boolean;
  roleLabel: (role: CollaboratorRoleValue) => string;
  disabled?: boolean;
  onRemove?: (collaborator: Collaborator) => void;
  onRoleChange?: (collaborator: Collaborator, role: CollaboratorRoleValue) => void;
}

const ROLE_OPTIONS: CollaboratorRoleValue[] = [
  CollaboratorRole.Manager,
  CollaboratorRole.Editor,
  CollaboratorRole.Viewer,
];

function roleStyle(role: CollaboratorRoleValue): { background: string; color: string } {
  if (role === "manager") {
    return { background: "var(--accent-soft)", color: "var(--accent-ink)" };
  }

  return { background: "var(--surface-2)", color: "var(--fg-2)" };
}

export function TripShareCollaboratorRow({
  collaborator,
  isCurrentUser = false,
  roleLabel,
  disabled = false,
  onRemove,
  onRoleChange,
}: TripShareCollaboratorRowProps): ReactElement {
  const isLocked = !!collaborator.isCreator || isCurrentUser;
  const collaboratorId = collaborator.id;

  return (
    <div
      className="flex items-center gap-2"
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
        <div
          className="flex items-center gap-1.5"
          style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 500, color: "var(--fg)" }}
        >
          <span>{collaborator.name}</span>
          {isCurrentUser ? (
            <span
              className="rounded-full px-1.5 text-xs"
              style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}
            >
              You
            </span>
          ) : null}
        </div>
        <div style={{ fontSize: "calc(11.5px * var(--font-scale))", color: "var(--fg-3)" }}>{collaborator.email}</div>
      </div>
      {isLocked ? (
        <span
          aria-label={
            collaborator.isCreator ? "Trip creator — access can't be changed" : "Your access can't be changed here"
          }
          className="flex size-11 shrink-0 items-center justify-center"
          style={{ color: "var(--fg-4)" }}
        >
          <Lock size={16} strokeWidth={1.5} />
        </span>
      ) : (
        <>
          {onRoleChange && collaboratorId ? (
            <Select
              disabled={disabled}
              value={collaborator.role}
              onValueChange={(value) => onRoleChange(collaborator, value as CollaboratorRoleValue)}
            >
              <SelectTrigger
                aria-label={`Role for ${collaborator.name}`}
                className="h-11 min-w-28"
                style={roleStyle(collaborator.role)}
              >
                <SelectValue>{roleLabel(collaborator.role)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {roleLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span
              className="inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium"
              style={roleStyle(collaborator.role)}
            >
              {roleLabel(collaborator.role)}
            </span>
          )}
          {onRemove && collaboratorId ? (
            <Button
              className="size-11 shrink-0"
              disabled={disabled}
              onClick={() => onRemove(collaborator)}
              size="icon-lg"
              title={`Remove ${collaborator.name}`}
              variant="ghost"
            >
              <Trash2 size={18} strokeWidth={1.5} style={{ color: "var(--fg-3)", transition: "color 150ms ease" }} />
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
