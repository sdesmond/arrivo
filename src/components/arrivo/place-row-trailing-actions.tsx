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
    <>
      {/* Drag handle — always visible on mobile, hover-only on desktop */}
      {dragHandle && (
        <span
          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center"
          style={{ color: "var(--fg-4)" }}
        >
          {dragHandle}
        </span>
      )}

      {/* Trash icon — always visible on mobile, hover-only on desktop */}
      <button
        onClick={onDelete}
        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center"
        style={{
          color: "var(--fg-4)",
          padding: 4,
          borderRadius: 4,
          background: "none",
          border: "none",
          cursor: "pointer",
          flexShrink: 0,
        }}
        title="Delete event"
      >
        <Trash2 size={IconSize.placeAction} strokeWidth={1.5} />
      </button>
    </>
  );
}
