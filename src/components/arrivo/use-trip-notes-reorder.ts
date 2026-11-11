"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import type { TripNote } from "@/data/types";
import { ApiClientError } from "@/lib/api/client";
import { reorderTripNotes as reorderTripNotesEndpoint } from "@/lib/api/contract/trip-notes";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { getNoteTitle } from "@/lib/note-preview";
import { sameNoteOrder, verticalOnlyKeyboardCoordinates } from "./trip-notes-drag-config";
import { reorderHandleId } from "./trip-notes-sortable-row";

const REORDER_ERROR_MESSAGE = "Couldn't reorder notes. Try again.";

export interface UseTripNotesReorderOptions {
  tripId: string;
  notes: TripNote[];
  onAnnounce: (message: string) => void;
}

export function useTripNotesReorder({ tripId, notes, onAnnounce }: UseTripNotesReorderOptions) {
  const router = useRouter();
  const reorderMutation = useApiMutation(reorderTripNotesEndpoint);
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

    let persisted = false;
    try {
      // `mutate` never rejects: the hook toasts a failure. A 409 means the notes changed under this list, so reload.
      await reorderMutation.mutate(
        { params: { tripId }, body: { noteIds: finalOrder.map((note) => note.id) } },
        {
          key: `trip-notes-order:${tripId}`,
          onSuccess: () => {
            persisted = true;
          },
          onError: (error) => {
            if (error instanceof ApiClientError && error.code === "conflict") router.refresh();
          },
        }
      );
    } finally {
      setIsPersisting(false);
    }

    if (persisted) {
      const newIndex = finalOrder.findIndex((note) => note.id === activeIdString);
      if (newIndex !== -1) {
        const note = finalOrder[newIndex];
        onAnnounce(`Reordered. ${getNoteTitle(note)} now at position ${newIndex + 1} of ${finalOrder.length}`);
      }
      focusHandleIdRef.current = activeIdString;
      // Focus the dragged handle immediately rather than waiting for the effect, which only
      // re-runs when `workingNotes` changes identity (i.e. after the parent's refetch).
      document.getElementById(reorderHandleId(activeIdString))?.focus();
      return;
    }

    setWorkingOrder(null);
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

  return {
    workingNotes,
    activeNote,
    isPersisting,
    isDragInert: activeId !== null && !isKeyboardDrag,
    sensors,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
    handleHandleKeyDown,
    handleHandleBlur,
  };
}
