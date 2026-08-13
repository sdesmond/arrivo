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
import { GripVertical, StickyNote } from "lucide-react";
import { toast } from "sonner";
import type { TripNote } from "@/data/types";
import { reorderTripNotes } from "@/app/(app)/trips/[tripId]/actions";
import { getNoteTitle, getNotePreviewLine } from "@/lib/note-preview";
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
  isDragInert: boolean;
  onToggle: (noteId: string) => void | Promise<void>;
  onDeleteRequest: (noteId: string) => void;
  onHandleKeyDown: (event: ReactKeyboardEvent, note: TripNote) => void;
  onHandleBlur: (noteId: string) => void;
  editor?: ReactNode;
}

function SortableTripNoteRow({
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
  const [isKeyboardDrag, setIsKeyboardDrag] = useState(false);
  const isKeyboardDragRef = useRef(false);
  const preDragOrderRef = useRef<TripNote[]>(notes);
  const focusHandleIdRef = useRef<string | null>(null);
  // dnd-kit reads its onDragOver/onDragEnd/onDragCancel props via an effect-synced ref
  // (@dnd-kit/core's `useLatestValue`), which can still be one render behind a same-drag
  // sequence of rapid key presses. Mirror `localOrder` into a plain ref, updated synchronously
  // alongside every `setLocalOrder` call, so those handlers always read the true current value
  // regardless of whether React has re-rendered (and dnd-kit's effect has resynced) yet.
  const localOrderRef = useRef<TripNote[] | null>(null);
  // Freshest `notes` prop for event handlers (which may run against a stale render closure).
  const notesRef = useRef<TripNote[]>(notes);

  // `localOrder` is authoritative only while a drag or persistence round-trip is in flight. Once
  // the parent delivers a refreshed `notes` prop after a settled drag — equal or divergent — that
  // is server truth and the optimistic order must not shadow it (a new Note created at top, or a
  // concurrent delete, has to render immediately). While a drag/persist is still active, a
  // concurrent refresh must not disturb the in-flight candidate order.
  useEffect(() => {
    notesRef.current = notes;
    if (!localOrder || activeId !== null || isPersisting) return;
    if (notes === preDragOrderRef.current) return;
    setLocalOrder(null);
  }, [notes, localOrder, activeId, isPersisting]);

  const workingNotes = localOrder ?? notes;

  function setWorkingOrder(order: TripNote[] | null): void {
    localOrderRef.current = order;
    setLocalOrder(order);
  }

  function getWorkingNotes(): TripNote[] {
    const order = localOrderRef.current;
    return order ?? notes;
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
    // A drag always starts from the freshly persisted order: clear any optimistic order left
    // over from a previous drag (it may be stale against a newer `notes` prop) so the working
    // baseline and the drag payload can never be built from an outdated set.
    setWorkingOrder(null);
    preDragOrderRef.current = notes;
    setActiveId(String(active.id));
    const keyboardDrag = activatorEvent instanceof KeyboardEvent;
    isKeyboardDragRef.current = keyboardDrag;
    setIsKeyboardDrag(keyboardDrag);

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
    setIsKeyboardDrag(false);

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
    setIsKeyboardDrag(false);
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
      if (newIndex !== -1) {
        const note = finalOrder[newIndex];
        onAnnounce(`Reordered. ${getNoteTitle(note)} now at position ${newIndex + 1} of ${finalOrder.length}`);
      }
      focusHandleIdRef.current = activeIdString;
      // Focus the dragged handle immediately rather than waiting for the effect, which only
      // re-runs when `workingNotes` changes identity (i.e. after the parent's refetch).
      document.getElementById(reorderHandleId(activeIdString))?.focus();
    } catch {
      setWorkingOrder(null);
      toast.error(REORDER_ERROR_MESSAGE);
      // Announce from whatever order is (or is about to be) rendered — `notesRef` is the
      // freshest reference including any concurrent refresh during the failed flight, so the
      // restored position matches the DOM instead of a stale pre-drag snapshot.
      const currentNotes = notesRef.current;
      const restoredIndex = currentNotes.findIndex((note) => note.id === activeIdString);
      if (restoredIndex !== -1) {
        const note = currentNotes[restoredIndex];
        onAnnounce(
          `${REORDER_ERROR_MESSAGE} ${getNoteTitle(note)} restored to position ${restoredIndex + 1} of ${currentNotes.length}`
        );
      } else {
        onAnnounce(REORDER_ERROR_MESSAGE);
      }
      focusHandleIdRef.current = activeIdString;
    } finally {
      setIsPersisting(false);
    }
  }

  function handleHandleKeyDown(event: ReactKeyboardEvent, note: TripNote): void {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    // Key auto-repeat would otherwise flood the live region with identical boundary messages.
    if (event.repeat) return;
    // Boundary messaging is a keyboard-drag concern only; a pointer drag that happens to have
    // an arrow key pressed must not announce anything.
    if (!isKeyboardDragRef.current || activeId !== note.id) return;

    const base = getWorkingNotes();
    const index = base.findIndex((entry) => entry.id === note.id);
    if (index === -1) return;

    const atTop = index === 0;
    const atBottom = index === base.length - 1;
    if ((event.key === "ArrowUp" && atTop) || (event.key === "ArrowDown" && atBottom)) {
      onAnnounce(`${getNoteTitle(note)} is already at position ${index + 1} of ${base.length}`);
    }
  }

  function handleHandleBlur(noteId: string): void {
    if (activeId !== noteId || !isKeyboardDragRef.current) return;
    // dnd-kit's KeyboardSensor binds its move/drop/cancel listeners to the whole document for
    // the duration of a keyboard drag, so Tab away (or any focus change) would leave arrows,
    // Enter/Space, and Escape hijacking whatever field now has focus. Cancel the drag through
    // the same Escape path dnd-kit itself uses when the user presses Escape.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
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
            isDragInert={activeId !== null && !isKeyboardDrag}
            onToggle={onToggle}
            onDeleteRequest={onDeleteRequest}
            onHandleKeyDown={handleHandleKeyDown}
            onHandleBlur={handleHandleBlur}
            editor={expandedNoteId === note.id ? renderEditor(note) : undefined}
          />
        ))}
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeNote ? (
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
                {getNoteTitle(activeNote)}
              </div>
              <div
                className="line-clamp-1"
                style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--fg-2)", overflowWrap: "anywhere" }}
              >
                {getNotePreviewLine(activeNote)}
              </div>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
