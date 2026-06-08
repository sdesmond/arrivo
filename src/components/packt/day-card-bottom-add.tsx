"use client";

import { Plus } from "lucide-react";
import { TypePicker } from "./type-picker";
import { ItineraryItemType } from "@/data/types";

export interface DayCardBottomAddProps {
  dayNumber: number;
  openGapKey: string | null;
  bottomInsertPosition: number;
  openGap: (key: string) => void;
  activateDraft: (type: ItineraryItemType, insertAtPosition: number, gapKey: string) => void;
  closeGap: () => void;
  onOpenPackingListPicker?: (insertAtPosition: number) => void;
}

export function DayCardBottomAdd({
  dayNumber,
  openGapKey,
  bottomInsertPosition,
  openGap,
  activateDraft,
  closeGap,
  onOpenPackingListPicker,
}: DayCardBottomAddProps) {
  if (openGapKey === "bottom") {
    return (
      <div className="flex items-center mt-1" style={{ paddingLeft: 12, paddingTop: 4, paddingBottom: 4 }}>
        <TypePicker
          onSelect={(type) => activateDraft(type, bottomInsertPosition, "bottom")}
          onDismiss={closeGap}
          onOpenPackingListPicker={
            onOpenPackingListPicker ? () => onOpenPackingListPicker(bottomInsertPosition) : undefined
          }
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => openGap("bottom")}
      className="flex items-center gap-2 px-3 py-2 mt-1 rounded-[6px] transition-colors hover:bg-surface"
      style={{
        fontSize: "calc(12.5px * var(--font-scale))",
        color: "var(--fg-4)",
        border: "none",
        background: "none",
      }}
    >
      <span
        className="flex items-center justify-center rounded-full"
        style={{ width: 18, height: 18, background: "var(--surface-2)" }}
      >
        <Plus size={11} strokeWidth={2} />
      </span>
      Add a place to day {dayNumber}
    </button>
  );
}
