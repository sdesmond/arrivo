"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import type { TripNote } from "@/data/types";
import { reorderTripNotes } from "@/app/(app)/trips/[tripId]/actions";
import { getNoteTitle } from "@/lib/note-preview";
import { TripNotesRow } from "./trip-notes-row";

export interface TripNotesSortableProps {
  tripId: string;
  notes: TripNote[];
  expandedNoteId: string | null;
  onToggle: (noteId: string) => void | Promise<void>;
  onDeleteRequest: (noteId: string) => void;
  onAnnounce: (message: string) => void;
  renderEditor: (note: TripNote) => ReactNode;
}

const REORDER_ERROR_MESSAGE = "Couldn't reorder notes. Try again.";

// This single Notes live region (owned by TripNotesTab) is the sole source of drag
// announcements — dnd-kit's own built-in live region is silenced here so screen reader
// users never hear two competing announcers.
const silentAnnouncements: Announcements = {
  onDragStart: () => "",
  onDragOver: () => "",
  onDragEnd: () => "",
  onDragCancel: () => "",
};

const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "Press space or enter to lift a note for reordering. While lifted, press up or down to move it. " +
    "Press space or enter again to drop it in its new position, or press escape to cancel.",
};

// sortableKeyboardCoordinates handles all four arrow keys; Notes is a single vertical
// column where Left/Right must always be inert, so short-circuit those codes here
// rather than depending on layout geometry to make them no-ops.
const verticalOnlyKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
    return undefined;
  }
  return sortableKeyboardCoordinates(event, args);
};

function reorderHandleId(noteId: string): string {
  return `trip-note-reorder-${noteId}`;
}

function sameNoteOrder(first: TripNote[], second: TripNote[]): boolean {
  return first.length === second.length && first.every((note, index) => note.id === second[index]?.id);
}

interface SortableTripNoteRowProps {
  note: TripNote;
  index: number;
  total: number;
  isExpanded: boolean;
  isDisabled: boolean;
  onToggle: (noteId: string) => void | Promise<void>;
  onDeleteRequest: (noteId: string) => void;
  onHandleKeyDown: (event: ReactKeyboardEvent, note: TripNote) => void;
  editor?: ReactNode;
}

function SortableTripNoteRow({
  note,
  index,
  total,
  isExpanded,
  isDisabled,
  onToggle,
  onDeleteRequest,
  onHandleKeyDown,
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
    >
      <GripVertical size={16} strokeWidth={1.5} />
    </span>
  );

  return (
    <TripNotesRow
      note={note}
      isExpanded={isExpanded}
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

export function TripNotesSortable({
  tripId,
  notes,
  expandedNoteId,
  onToggle,
  onDeleteRequest,
  onAnnounce,
  renderEditor,
}: TripNotesSortableProps) {
  const [localOrder, setLocalOrder] = useState<TripNote[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isPersisting, setIsPersisting] = useState(false);
  const isKeyboardDragRef = useRef(false);
  const preDragOrderRef = useRef<TripNote[]>(notes);
  const focusHandleIdRef = useRef<string | null>(null);
  // dnd-kit reads its onDragOver/onDragEnd/onDragCancel props via an effect-synced ref
  // (@dnd-kit/core's `useLatestValue`), which can still be one render behind a same-drag
  // sequence of rapid key presses. Mirror `localOrder` into a plain ref, updated synchronously
  // alongside every `setLocalOrder` call, so those handlers always read the true current value
  // regardless of whether React has re-rendered (and dnd-kit's effect has resynced) yet.
  const localOrderRef = useRef<TripNote[] | null>(null);

  // Once the persisted `notes` prop catches up with an optimistic `localOrder`, fall back to
  // `notes` as the render source — deriving this at render time (rather than clearing
  // `localOrder` from an effect) avoids the extra cascading render an effect-driven reset would
  // cause; `localOrder` itself is only ever reassigned by the drag handlers.
  const workingNotes = localOrder && !sameNoteOrder(localOrder, notes) ? localOrder : notes;

  function setWorkingOrder(order: TripNote[] | null): void {
    localOrderRef.current = order;
    setLocalOrder(order);
  }

  function getWorkingNotes(): TripNote[] {
    const order = localOrderRef.current;
    return order && !sameNoteOrder(order, notes) ? order : notes;
  }

  useEffect(() => {
    if (!focusHandleIdRef.current) return;
    const id = focusHandleIdRef.current;
    focusHandleIdRef.current = null;
    document.getElementById(reorderHandleId(id))?.focus();
  }, [workingNotes]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: verticalOnlyKeyboardCoordinates })
  );

  function announcePosition(note: TripNote, index: number, total: number): void {
    onAnnounce(`${getNoteTitle(note)}, position ${index + 1} of ${total}`);
  }

  function handleDragStart({ active, activatorEvent }: DragStartEvent): void {
    preDragOrderRef.current = notes;
    setActiveId(String(active.id));
    isKeyboardDragRef.current = activatorEvent instanceof KeyboardEvent;

    if (isKeyboardDragRef.current) {
      const note = notes.find((entry) => entry.id === active.id);
      if (note) {
        onAnnounce(
          `Reordering ${getNoteTitle(note)}. Use up and down arrow keys to move, space or enter to drop, escape to cancel.`
        );
      }
    }
  }

  function handleDragOver({ active, over }: DragOverEvent): void {
    if (!over || active.id === over.id) return;
    const base = getWorkingNotes();
    const activeIndex = base.findIndex((note) => note.id === active.id);
    const overIndex = base.findIndex((note) => note.id === over.id);
    if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) return;

    const candidate = arrayMove(base, activeIndex, overIndex);
    setWorkingOrder(candidate);

    if (isKeyboardDragRef.current) {
      const newIndex = candidate.findIndex((note) => note.id === active.id);
      announcePosition(candidate[newIndex], newIndex, candidate.length);
    }
  }

  function handleDragCancel(event: DragCancelEvent): void {
    const wasKeyboard = isKeyboardDragRef.current;
    const draggedId = String(event.active.id);
    const persistedOrder = preDragOrderRef.current;
    const originalIndex = persistedOrder.findIndex((note) => note.id === draggedId);

    setWorkingOrder(null);
    setActiveId(null);
    isKeyboardDragRef.current = false;

    if (wasKeyboard && originalIndex !== -1) {
      const note = persistedOrder[originalIndex];
      onAnnounce(
        `Reorder cancelled. ${getNoteTitle(note)} restored to position ${originalIndex + 1} of ${persistedOrder.length}`
      );
      focusHandleIdRef.current = draggedId;
    }
  }

  async function handleDragEnd({ active }: DragEndEvent): Promise<void> {
    isKeyboardDragRef.current = false;
    setActiveId(null);

    const activeIdString = String(active.id);
    const finalOrder = getWorkingNotes();
    const persistedOrder = preDragOrderRef.current;

    if (sameNoteOrder(finalOrder, persistedOrder)) {
      setWorkingOrder(null);
      return;
    }

    setWorkingOrder(finalOrder);
    setIsPersisting(true);

    try {
      await reorderTripNotes({ tripId, orderedNoteIds: finalOrder.map((note) => note.id) });
      const newIndex = finalOrder.findIndex((note) => note.id === activeIdString);
      const note = finalOrder[newIndex];
      onAnnounce(`Reordered. ${getNoteTitle(note)} now at position ${newIndex + 1} of ${finalOrder.length}`);
      focusHandleIdRef.current = activeIdString;
    } catch {
      setWorkingOrder(null);
      toast.error(REORDER_ERROR_MESSAGE);
      const restoredIndex = persistedOrder.findIndex((note) => note.id === activeIdString);
      const note = persistedOrder[restoredIndex];
      onAnnounce(
        `${REORDER_ERROR_MESSAGE} ${getNoteTitle(note)} restored to position ${restoredIndex + 1} of ${persistedOrder.length}`
      );
      focusHandleIdRef.current = activeIdString;
    } finally {
      setIsPersisting(false);
    }
  }

  function handleHandleKeyDown(event: ReactKeyboardEvent, note: TripNote): void {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (activeId !== note.id) return;

    const base = getWorkingNotes();
    const index = base.findIndex((entry) => entry.id === note.id);
    if (index === -1) return;

    const atTop = index === 0;
    const atBottom = index === base.length - 1;
    if ((event.key === "ArrowUp" && atTop) || (event.key === "ArrowDown" && atBottom)) {
      onAnnounce(`${getNoteTitle(note)} is already at position ${index + 1} of ${base.length}`);
    }
  }

  const activeNote = activeId ? workingNotes.find((note) => note.id === activeId) : undefined;

  return (
    <DndContext
      id="trip-notes"
      sensors={sensors}
      accessibility={{ announcements: silentAnnouncements, screenReaderInstructions }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={workingNotes.map((note) => note.id)} strategy={verticalListSortingStrategy}>
        {workingNotes.map((note, index) => (
          <SortableTripNoteRow
            key={note.id}
            note={note}
            index={index}
            total={workingNotes.length}
            isExpanded={expandedNoteId === note.id}
            isDisabled={isPersisting}
            onToggle={onToggle}
            onDeleteRequest={onDeleteRequest}
            onHandleKeyDown={handleHandleKeyDown}
            editor={expandedNoteId === note.id ? renderEditor(note) : undefined}
          />
        ))}
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeNote ? (
          <TripNotesRow note={activeNote} isExpanded={false} onToggle={() => {}} onDeleteRequest={() => {}} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
