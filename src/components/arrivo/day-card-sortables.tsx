"use client";

import { GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PlaceRow } from "./place-row";
import { NoteItem } from "./note-item";
import { ChecklistItem } from "./checklist-item";
import { useCanEditTrip } from "./trip-edit-access";

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
      <PlaceRow {...props} dragHandle={canEdit ? makeDragHandle(attributes, listeners) : undefined} />
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
      <NoteItem {...props} dragHandle={canEdit ? makeDragHandle(attributes, listeners) : undefined} />
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
      <ChecklistItem {...props} dragHandle={canEdit ? makeDragHandle(attributes, listeners) : undefined} />
    </div>
  );
}
