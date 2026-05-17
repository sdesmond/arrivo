"use client";

import { GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PlaceRow } from "./place-row";
import { NoteItem } from "./note-item";
import { ChecklistItem } from "./checklist-item";

function makeDragHandle(
  attributes: ReturnType<typeof useSortable>["attributes"],
  listeners: ReturnType<typeof useSortable>["listeners"]
) {
  return (
    <span
      {...attributes}
      {...listeners}
      style={{ cursor: "grab", display: "flex", alignItems: "center", touchAction: "none" }}
    >
      <GripVertical size={13} strokeWidth={1.5} />
    </span>
  );
}

export function SortablePlaceRow(props: React.ComponentProps<typeof PlaceRow>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.place.id,
    animateLayoutChanges: () => false,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <PlaceRow {...props} dragHandle={makeDragHandle(attributes, listeners)} />
    </div>
  );
}

export function SortableNoteItem(props: React.ComponentProps<typeof NoteItem>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.note.id,
    animateLayoutChanges: () => false,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <NoteItem {...props} dragHandle={makeDragHandle(attributes, listeners)} />
    </div>
  );
}

export function SortableChecklistItem(props: React.ComponentProps<typeof ChecklistItem>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.checklist.id,
    animateLayoutChanges: () => false,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <ChecklistItem {...props} dragHandle={makeDragHandle(attributes, listeners)} />
    </div>
  );
}
