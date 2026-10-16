"use client";

import { useCanEditTrip } from "./trip-edit-access";

export interface PlaceRowNoteEditorProps {
  note?: string;
  isEditingNote: boolean;
  draftNote: string;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onStartEdit: () => void;
}

export function PlaceRowNoteEditor({
  note,
  isEditingNote,
  draftNote,
  onDraftChange,
  onSave,
  onCancel,
  onStartEdit,
}: PlaceRowNoteEditorProps) {
  const canEdit = useCanEditTrip();
  const noteStyle: React.CSSProperties = {
    fontSize: "calc(var(--fs-card-sub) * var(--font-scale))",
    borderRadius: 6,
    padding: "4px 10px",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    color: note ? "var(--fg-2)" : "var(--fg-4)",
  };

  if (!canEdit) {
    return note ? <div style={noteStyle}>{note}</div> : null;
  }

  if (isEditingNote) {
    return (
      <textarea
        autoFocus
        value={draftNote}
        onChange={(event) => onDraftChange(event.target.value)}
        onBlur={onSave}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onCancel();
          }
        }}
        rows={2}
        style={{
          width: "100%",
          fontSize: "calc(var(--fs-card-sub) * var(--font-scale))",
          color: "var(--fg-2)",
          background: "var(--surface-2)",
          border: "1px solid var(--accent-brand)",
          borderLeft: "2px solid var(--accent-brand)",
          borderRadius: 6,
          padding: "6px 10px",
          outline: "none",
          resize: "vertical",
          fontFamily: "inherit",
          lineHeight: 1.5,
        }}
      />
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onStartEdit}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          onStartEdit();
        }
      }}
      style={{ ...noteStyle, cursor: "text" }}
    >
      {note ?? "Add a note..."}
    </div>
  );
}
