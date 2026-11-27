"use client";

import { GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PlaceRow } from "./place-row";
import { NoteItem } from "./note-item";
import { ChecklistItem } from "./checklist-item";
import { useCanEditTrip } from "./trip-edit-access";
import { IconSize } from "@/lib/size-tokens";

const LABEL_LIMIT = 40;
const GRIP_CLASS = "flex size-11 shrink-0 items-center justify-center";

/** Short spoken name for an itinerary row: its first line of text, otherwise its kind. */
export function getRowLabel(text: string | undefined, fallback: string) {
  const firstLine = text?.trim().split("\n")[0].trim();
  if (!firstLine) return fallback;
  return firstLine.length > LABEL_LIMIT ? `${firstLine.slice(0, LABEL_LIMIT).trimEnd()}…` : firstLine;
}

function makeDragHandle(
  label: string,
  attributes: ReturnType<typeof useSortable>["attributes"],
  listeners: ReturnType<typeof useSortable>["listeners"]
) {
  return (
    <span
      {...attributes}
      {...listeners}
      aria-label={`Reorder ${label}`}
      title="Drag to reorder"
      className={GRIP_CLASS}
      style={{ cursor: "grab", touchAction: "none" }}
    >
      <GripVertical size={IconSize.rowAction} strokeWidth={1.5} />
    </span>
  );
}

/** Inert grip for the drag preview, so its content lines up with the row being dragged. */
export function DragGripPreview() {
  return (
    <span aria-hidden="true" className={GRIP_CLASS}>
      <GripVertical size={IconSize.rowAction} strokeWidth={1.5} />
    </span>
  );
}

export function SortablePlaceRow(props: React.ComponentProps<typeof PlaceRow>) {
  const canEdit = useCanEditTrip();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.place.id,
    animateLayoutChanges: () => false,
    disabled: !canEdit,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <PlaceRow
        {...props}
        dragHandle={canEdit ? makeDragHandle(getRowLabel(props.place.name, "event"), attributes, listeners) : undefined}
      />
    </div>
  );
}

export function SortableNoteItem(props: React.ComponentProps<typeof NoteItem>) {
  const canEdit = useCanEditTrip();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.note.id,
    animateLayoutChanges: () => false,
    disabled: !canEdit,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <NoteItem
        {...props}
        dragHandle={
          canEdit ? makeDragHandle(getRowLabel(props.note.content, "note"), attributes, listeners) : undefined
        }
      />
    </div>
  );
}

export function SortableChecklistItem(props: React.ComponentProps<typeof ChecklistItem>) {
  const canEdit = useCanEditTrip();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.checklist.id,
    animateLayoutChanges: () => false,
    disabled: !canEdit,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <ChecklistItem
        {...props}
        dragHandle={
          canEdit ? makeDragHandle(getRowLabel(props.checklist.title, "checklist"), attributes, listeners) : undefined
        }
      />
    </div>
  );
}
