"use client";

import { Plus } from "lucide-react";
import { TypePicker } from "./type-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type ItineraryItemType } from "@/data/types";
import { useCanEditTrip } from "./trip-edit-access";

export interface GapZoneProps {
  gapKey: string;
  isActive: boolean;
  onOpen: () => void;
  onSelectType: (type: ItineraryItemType) => void;
  onDismiss: () => void;
  onOpenPackingListPicker?: () => void;
}

// Same height as the editable gap (20px trigger + py-2.5), so a viewer's items keep their spacing.
const READ_ONLY_GAP_HEIGHT = 40;

export function GapZone({ isActive, onOpen, onSelectType, onDismiss, onOpenPackingListPicker }: GapZoneProps) {
  const canEdit = useCanEditTrip();
  if (!canEdit) return <div aria-hidden="true" style={{ height: READ_ONLY_GAP_HEIGHT }} />;

  return (
    <Popover open={isActive} onOpenChange={(open) => (open ? onOpen() : onDismiss())}>
      <div className="group relative flex items-center px-3 py-2.5">
        <PopoverContent
          data-testid="gap-type-picker-popup"
          className="w-auto rounded-none bg-transparent p-0 shadow-none ring-0"
          side="bottom"
          align="start"
          sideOffset={8}
        >
          <TypePicker onSelect={onSelectType} onDismiss={onDismiss} onOpenPackingListPicker={onOpenPackingListPicker} />
        </PopoverContent>
        <div
          className="absolute inset-x-0 opacity-25 group-hover:opacity-50 transition-opacity"
          style={{ top: "50%", height: 1, background: "var(--line)", transform: "translateY(-50%)" }}
        />
        <PopoverTrigger
          onClick={() => {
            if (!isActive) {
              onOpen();
            }
          }}
          className="relative mx-auto flex items-center justify-center rounded-full opacity-100 transition-opacity sm:mr-0 sm:ml-3 sm:opacity-0 sm:group-hover:opacity-100"
          style={{
            width: 20,
            height: 20,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            cursor: "pointer",
          }}
          title="Insert item here"
        >
          <Plus size={11} strokeWidth={2} style={{ color: "var(--fg-3)" }} />
        </PopoverTrigger>
      </div>
    </Popover>
  );
}
