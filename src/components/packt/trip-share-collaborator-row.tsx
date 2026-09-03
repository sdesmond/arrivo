"use client";

import type { ReactElement } from "react";
import { Lock } from "lucide-react";
import type { Collaborator, CollaboratorRole } from "@/data/types";

interface TripShareCollaboratorRowProps {
  collaborator: Collaborator;
  roleLabel: (role: CollaboratorRole) => string;
}

function roleStyle(role: CollaboratorRole): { background: string; color: string } {
  if (role === "manager") {
    return { background: "var(--accent-soft)", color: "var(--accent-ink)" };
  }

  return { background: "var(--surface-2)", color: "var(--fg-2)" };
}

export function TripShareCollaboratorRow({ collaborator, roleLabel }: TripShareCollaboratorRowProps): ReactElement {
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
        <div style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 500, color: "var(--fg)" }}>
          {collaborator.name}
        </div>
        <div style={{ fontSize: "calc(11.5px * var(--font-scale))", color: "var(--fg-3)" }}>{collaborator.email}</div>
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
  );
}
