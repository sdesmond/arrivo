"use client";

import { ChevronDown, StickyNote } from "lucide-react";
import type { ReactNode } from "react";
import type { TripNote } from "@/data/types";
import { getNoteTitle, getNotePreviewLine } from "@/lib/note-preview";
import { cn } from "@/lib/utils";

export interface TripNotesRowProps {
  note: TripNote;
  isExpanded: boolean;
  onToggle: (noteId: string) => void | Promise<void>;
  editor?: ReactNode;
}

export function TripNotesRow({ note, isExpanded, onToggle, editor }: TripNotesRowProps) {
  const title = getNoteTitle(note);
  const previewLine = getNotePreviewLine(note);
  const triggerId = `trip-note-disclosure-${note.id}`;
  const regionId = `trip-note-region-${note.id}`;
  const regionLabelId = `trip-note-region-label-${note.id}`;

  return (
    <li
      className="flex items-start gap-3 rounded-xl px-3 py-2.5"
      style={{
        border: "1px solid var(--line)",
        background: "var(--bg)",
      }}
    >
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center"
        style={{
          width: 22,
          height: 22,
          marginTop: 11,
          borderRadius: "50%",
          background: "var(--surface-2)",
          color: "var(--fg-3)",
        }}
      >
        <StickyNote size={12} strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1">
        <button
          id={triggerId}
          type="button"
          aria-expanded={isExpanded}
          aria-controls={regionId}
          className={cn(
            "flex items-center gap-2 border-0 bg-transparent p-0 text-left",
            isExpanded ? "justify-end" : "w-full"
          )}
          style={{ minHeight: 44, minWidth: 44, color: "var(--fg)", cursor: "pointer" }}
          onClick={() => void onToggle(note.id)}
        >
          {isExpanded ? (
            <span className="sr-only">Collapse {title}</span>
          ) : (
            <span className="min-w-0 flex-1">
              <span
                className="line-clamp-1 block"
                style={{
                  fontSize: "calc(13px * var(--font-scale))",
                  color: "var(--fg)",
                  overflowWrap: "anywhere",
                }}
              >
                {title}
              </span>
              <span
                className="line-clamp-1 block"
                style={{
                  fontSize: "calc(12px * var(--font-scale))",
                  color: "var(--fg-2)",
                  overflowWrap: "anywhere",
                }}
              >
                {previewLine}
              </span>
            </span>
          )}
          <ChevronDown
            aria-hidden
            size={16}
            strokeWidth={1.5}
            className={cn("shrink-0 transition-transform", isExpanded && "rotate-180")}
          />
        </button>
        {isExpanded ? (
          <div id={regionId} role="region" aria-labelledby={regionLabelId}>
            <span id={regionLabelId} className="sr-only">
              {title}
            </span>
            {editor}
          </div>
        ) : null}
      </div>
    </li>
  );
}
