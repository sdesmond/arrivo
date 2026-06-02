"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type Collaborator } from "@/data/types";
import { RailPanel } from "./rail-panel";

interface CollaboratorsRailProps {
  collaborators: Collaborator[];
}

export function CollaboratorsRail({ collaborators }: CollaboratorsRailProps) {
  return (
    <RailPanel header="Collaborators" meta={String(collaborators.length)}>
      <div className="flex flex-col gap-1">
        {collaborators.map((collaborator, i) => (
          <div key={i} className="flex items-center gap-2.5 rounded-[6px] px-2 py-2">
            <span
              className="flex items-center justify-center rounded-full shrink-0 text-xs font-semibold"
              style={{
                width: 30,
                height: 30,
                background: collaborator.tint?.bg,
                color: collaborator.tint?.fg,
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: "calc(11px * var(--font-scale))",
              }}
            >
              {collaborator.initials}
            </span>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 600, color: "var(--fg)" }}>
                {collaborator.name}
              </div>
              <div style={{ fontSize: "calc(11px * var(--font-scale))", color: "var(--fg-4)" }}>
                {collaborator.email}
              </div>
            </div>
            <span
              style={{
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: "calc(10px * var(--font-scale))",
                fontWeight: 500,
                color: "var(--fg-3)",
                letterSpacing: "0.04em",
              }}
            >
              {collaborator.role}
            </span>
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" className="w-full mt-2">
        <Plus size={13} strokeWidth={1.5} />
        Invite
      </Button>
    </RailPanel>
  );
}
