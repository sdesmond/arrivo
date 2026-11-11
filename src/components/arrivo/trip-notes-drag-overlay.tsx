"use client";

import { GripVertical, StickyNote } from "lucide-react";
import type { TripNote } from "@/data/types";
import { getNoteTitle, getNotePreviewLine } from "@/lib/note-preview";

export interface TripNotesDragOverlayProps {
  note: TripNote;
}

export function TripNotesDragOverlay({ note }: TripNotesDragOverlayProps) {
  return (
    <div
      aria-hidden
      className="flex items-start gap-3 rounded-xl px-3 py-2.5"
      style={{
        width: "min(100vw - 2rem, 46rem)",
        border: "1px solid var(--line)",
        background: "var(--bg)",
        color: "var(--fg)",
        pointerEvents: "none",
      }}
    >
      <span
        className="flex shrink-0 items-center justify-center rounded-2xl"
        style={{ minHeight: 44, minWidth: 44, color: "var(--fg-3)", touchAction: "none" }}
      >
        <GripVertical size={16} strokeWidth={1.5} />
      </span>
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
        <div
          className="line-clamp-1"
          style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--fg)", overflowWrap: "anywhere" }}
        >
          {getNoteTitle(note)}
        </div>
        <div
          className="line-clamp-1"
          style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--fg-2)", overflowWrap: "anywhere" }}
        >
          {getNotePreviewLine(note)}
        </div>
      </div>
    </div>
  );
}
