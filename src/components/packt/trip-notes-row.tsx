import { StickyNote } from "lucide-react";
import type { TripNote } from "@/data/types";
import { getNoteTitle, getNotePreviewLine } from "@/lib/note-preview";

export interface TripNotesRowProps {
  note: TripNote;
}

export function TripNotesRow({ note }: TripNotesRowProps) {
  const title = getNoteTitle(note);
  const previewLine = getNotePreviewLine(note);

  return (
    <li className="flex items-start gap-3 px-3 py-2.5" style={{ minHeight: 44 }}>
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center"
        style={{
          width: 22,
          height: 22,
          marginTop: 1,
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
          style={{
            fontSize: "calc(13px * var(--font-scale))",
            color: "var(--fg)",
            overflowWrap: "anywhere",
          }}
        >
          {title}
        </div>
        <div
          className="line-clamp-1"
          style={{
            fontSize: "calc(12px * var(--font-scale))",
            color: "var(--fg-2)",
            overflowWrap: "anywhere",
          }}
        >
          {previewLine}
        </div>
      </div>
    </li>
  );
}
