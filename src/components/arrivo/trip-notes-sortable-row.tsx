"use client";

import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { TripNote } from "@/data/types";
import { getNoteTitle } from "@/lib/note-preview";
import { TripNotesRow } from "./trip-notes-row";

export function reorderHandleId(noteId: string): string {
  return `trip-note-reorder-${noteId}`;
}

export interface SortableTripNoteRowProps {
  note: TripNote;
  index: number;
  total: number;
  isExpanded: boolean;
  isDisabled: boolean;
  isDragInert: boolean;
  onToggle: (noteId: string) => void | Promise<void>;
  onDeleteRequest: (noteId: string) => void;
  onHandleKeyDown: (event: ReactKeyboardEvent, note: TripNote) => void;
  onHandleBlur: (noteId: string) => void;
  editor?: ReactNode;
}

export function SortableTripNoteRow({
  note,
  index,
  total,
  isExpanded,
  isDisabled,
  isDragInert,
  onToggle,
  onDeleteRequest,
  onHandleKeyDown,
  onHandleBlur,
  editor,
}: SortableTripNoteRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: note.id,
    disabled: isDisabled,
    animateLayoutChanges: () => false,
  });
  const accessibleName = `Reorder ${getNoteTitle(note)}, position ${index + 1} of ${total}`;

  const dragHandle = (
    <span
      id={reorderHandleId(note.id)}
      {...attributes}
      {...listeners}
      aria-label={accessibleName}
      role="button"
      tabIndex={0}
      title={accessibleName}
      className="flex shrink-0 items-center justify-center rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        minHeight: 44,
        minWidth: 44,
        cursor: "grab",
        touchAction: "none",
        outlineColor: "var(--accent-brand)",
        color: "var(--fg-3)",
      }}
      onKeyDown={(event) => {
        // listeners.onKeyDown is dnd-kit's own KeyboardSensor activation handler (Space/Enter
        // lift+drop, Up/Down move) — it must still run. Ours only observes boundary attempts
        // dnd-kit silently swallows (its coordinateGetter returns undefined at either end, so no
        // drag callback ever fires for those key presses).
        listeners?.onKeyDown?.(event);
        onHandleKeyDown(event, note);
      }}
      onBlur={() => onHandleBlur(note.id)}
    >
      <GripVertical size={16} strokeWidth={1.5} />
    </span>
  );

  return (
    <TripNotesRow
      note={note}
      isExpanded={isExpanded}
      isDragInert={isDragInert}
      onToggle={onToggle}
      onDeleteRequest={onDeleteRequest}
      editor={editor}
      dragHandle={dragHandle}
      rootRef={setNodeRef}
      rootStyle={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0 : 1,
      }}
    />
  );
}
