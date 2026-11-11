"use client";

import type { ReactNode } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { TripNote } from "@/data/types";
import { screenReaderInstructions, silentAnnouncements } from "./trip-notes-drag-config";
import { TripNotesDragOverlay } from "./trip-notes-drag-overlay";
import { SortableTripNoteRow } from "./trip-notes-sortable-row";
import { useTripNotesReorder } from "./use-trip-notes-reorder";

export interface TripNotesSortableProps {
  tripId: string;
  notes: TripNote[];
  expandedNoteId: string | null;
  onToggle: (noteId: string) => void | Promise<void>;
  onDeleteRequest: (noteId: string) => void;
  onAnnounce: (message: string) => void;
  renderEditor: (note: TripNote) => ReactNode;
}

export function TripNotesSortable({
  tripId,
  notes,
  expandedNoteId,
  onToggle,
  onDeleteRequest,
  onAnnounce,
  renderEditor,
}: TripNotesSortableProps) {
  const reorder = useTripNotesReorder({ tripId, notes, onAnnounce });

  return (
    <DndContext
      id="trip-notes"
      sensors={reorder.sensors}
      accessibility={{ announcements: silentAnnouncements, screenReaderInstructions }}
      onDragStart={reorder.handleDragStart}
      onDragOver={reorder.handleDragOver}
      onDragEnd={reorder.handleDragEnd}
      onDragCancel={reorder.handleDragCancel}
    >
      <SortableContext items={reorder.workingNotes.map((note) => note.id)} strategy={verticalListSortingStrategy}>
        {reorder.workingNotes.map((note, index) => (
          <SortableTripNoteRow
            key={note.id}
            note={note}
            index={index}
            total={reorder.workingNotes.length}
            isExpanded={expandedNoteId === note.id}
            isDisabled={reorder.isPersisting}
            isDragInert={reorder.isDragInert}
            onToggle={onToggle}
            onDeleteRequest={onDeleteRequest}
            onHandleKeyDown={reorder.handleHandleKeyDown}
            onHandleBlur={reorder.handleHandleBlur}
            editor={expandedNoteId === note.id ? renderEditor(note) : undefined}
          />
        ))}
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {reorder.activeNote ? <TripNotesDragOverlay note={reorder.activeNote} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
