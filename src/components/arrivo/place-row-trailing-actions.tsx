"use client";

import { Trash2 } from "lucide-react";
import { IconSize } from "@/lib/size-tokens";
import { useCanEditTrip } from "./trip-edit-access";

export interface PlaceRowTrailingActionsProps {
  dragHandle?: React.ReactNode;
  onDelete: () => void;
}

/** Drag handle and delete button at the end of an editable event row; viewers get neither. */
export function PlaceRowTrailingActions({ dragHandle, onDelete }: PlaceRowTrailingActionsProps) {
  const canEdit = useCanEditTrip();
  if (!canEdit) return null;

  return (
    // One centred group so handle and trash share a midline. The negative margins pull the 44px
    // targets into the row's padding so they sit level with the title instead of pushing it down.
    // Always visible on mobile; revealed on hover or keyboard focus on desktop.
    <div
      className="flex shrink-0 items-center -mt-2.5 -mr-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity"
      style={{ color: "var(--fg-4)" }}
    >
      {dragHandle}
      <button
        onClick={onDelete}
        className="flex size-11 shrink-0 items-center justify-center rounded"
        style={{ color: "var(--fg-4)", background: "none", border: "none", cursor: "pointer" }}
        title="Delete event"
      >
        <Trash2 size={IconSize.rowAction} strokeWidth={1.5} />
      </button>
    </div>
  );
}
