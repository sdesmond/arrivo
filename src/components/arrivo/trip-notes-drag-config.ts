import type { Announcements, KeyboardCoordinateGetter, ScreenReaderInstructions } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { TripNote } from "@/data/types";

// This single Notes live region (owned by TripNotesTab) is the sole source of drag
// announcements — dnd-kit's own built-in live region is silenced here so screen reader
// users never hear two competing announcers.
export const silentAnnouncements: Announcements = {
  onDragStart: () => "",
  onDragOver: () => "",
  onDragEnd: () => "",
  onDragCancel: () => "",
};

export const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "Press space or enter to lift a note for reordering. While lifted, press up or down to move it. " +
    "Press space or enter again to drop it in its new position, or press escape to cancel.",
};

// sortableKeyboardCoordinates handles all four arrow keys; Notes is a single vertical
// column where Left/Right must always be inert, so short-circuit those codes here
// rather than depending on layout geometry to make them no-ops.
export const verticalOnlyKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
    return undefined;
  }
  return sortableKeyboardCoordinates(event, args);
};

export function sameNoteOrder(first: TripNote[], second: TripNote[]): boolean {
  return first.length === second.length && first.every((note, index) => note.id === second[index]?.id);
}
