"use client";

import { useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ItineraryNote } from "@/data/types";
import { useCanEditTrip } from "./trip-edit-access";

interface NoteItemProps {
  note: ItineraryNote;
  onUpdate?: (id: string, content: string) => void;
  onDelete?: (id: string) => void;
  isDraft?: boolean;
  onCreate?: (content: string) => void;
  onCancelDraft?: () => void;
  dragHandle?: React.ReactNode;
  displayOnly?: boolean;
}

export function NoteItem({
  note,
  onUpdate,
  onDelete,
  isDraft,
  onCreate,
  onCancelDraft,
  dragHandle,
  displayOnly,
}: NoteItemProps) {
  const canEdit = useCanEditTrip();
  const [isEditing, setIsEditing] = useState(isDraft ?? false);
  const [draft, setDraft] = useState(note.content);

  function startEdit() {
    setDraft(note.content);
    setIsEditing(true);
  }

  function commit() {
    const trimmed = draft.trim();
    if (isDraft) {
      if (trimmed) onCreate?.(trimmed);
      else onCancelDraft?.();
      return;
    }
    if (trimmed && trimmed !== note.content) onUpdate?.(note.id, trimmed);
    setIsEditing(false);
  }

  function cancel() {
    if (isDraft) {
      onCancelDraft?.();
      return;
    }
    setDraft(note.content);
    setIsEditing(false);
  }

  return (
    <div
      id={displayOnly ? undefined : `note-${note.id}`}
      className={cn("group flex items-start gap-3 px-3 py-2.5 relative", dragHandle && "pr-16")}
      style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--fg-2)" }}
    >
      <span
        className="flex items-center justify-center shrink-0 mt-0.5"
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "var(--surface-2)",
          color: "var(--fg-3)",
        }}
      >
        <FileText size={12} strokeWidth={1.5} />
      </span>

      {isEditing ? (
        <textarea
          autoFocus
          placeholder="Add a note…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              commit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
          rows={Math.max(1, draft.split("\n").length)}
          style={{
            flex: 1,
            fontSize: "calc(13px * var(--font-scale))",
            color: "var(--fg-2)",
            background: "transparent",
            border: "none",
            borderBottom: "1px solid var(--accent-brand)",
            outline: "none",
            fontFamily: "inherit",
            resize: "none",
            lineHeight: 1.5,
            padding: "2px 0",
          }}
        />
      ) : !canEdit ? (
        <span style={{ flex: 1, lineHeight: 1.5, paddingTop: 2 }}>{note.content}</span>
      ) : (
        <span
          role="button"
          tabIndex={0}
          onClick={startEdit}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") startEdit();
          }}
          style={{ flex: 1, lineHeight: 1.5, paddingTop: 2, cursor: "text" }}
        >
          {note.content}
        </span>
      )}

      {canEdit && !isEditing && !isDraft && dragHandle && (
        <span
          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity absolute top-2 flex items-center"
          style={{ right: 32, color: "var(--fg-4)", padding: 4 }}
        >
          {dragHandle}
        </span>
      )}

      {canEdit && !isEditing && (
        <button
          onClick={() => onDelete?.(note.id)}
          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity absolute right-2 top-2"
          title="Delete note"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--fg-3)",
            padding: 4,
          }}
        >
          <Trash2 size={13} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
