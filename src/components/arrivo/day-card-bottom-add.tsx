"use client";

import { Plus } from "lucide-react";
import { TypePicker } from "./type-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ItineraryItemType } from "@/data/types";
import { useCanEditTrip } from "./trip-edit-access";

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
  const canEdit = useCanEditTrip();
  if (!canEdit) return null;

  return (
    <Popover open={openGapKey === "bottom"} onOpenChange={(open) => (open ? openGap("bottom") : closeGap())}>
      <div className="mt-1">
        <PopoverContent
          data-testid="bottom-type-picker-popup"
          className="w-auto rounded-none bg-transparent p-0 shadow-none ring-0"
          side="top"
          align="start"
          sideOffset={8}
        >
          <TypePicker
            onSelect={(type) => activateDraft(type, bottomInsertPosition, "bottom")}
            onDismiss={closeGap}
            onOpenPackingListPicker={
              onOpenPackingListPicker ? () => onOpenPackingListPicker(bottomInsertPosition) : undefined
            }
          />
        </PopoverContent>
        <PopoverTrigger
          onClick={() => {
            if (openGapKey !== "bottom") {
              openGap("bottom");
            }
          }}
          className="flex min-h-11 items-center gap-2 rounded-[6px] px-3 py-2 transition-colors hover:bg-surface"
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
        </PopoverTrigger>
      </div>
    </Popover>
  );
}
