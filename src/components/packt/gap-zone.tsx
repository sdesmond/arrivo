"use client";

import { Plus } from "lucide-react";
import { TypePicker } from "./type-picker";
import { type ItineraryItemType } from "@/data/types";

export interface GapZoneProps {
  gapKey: string;
  isActive: boolean;
  onOpen: () => void;
  onSelectType: (type: ItineraryItemType) => void;
  onDismiss: () => void;
}

export function GapZone({ isActive, onOpen, onSelectType, onDismiss }: GapZoneProps) {
  if (isActive) {
    return (
      <div className="flex items-center" style={{ height: 32, paddingLeft: 12 }}>
        <TypePicker onSelect={onSelectType} onDismiss={onDismiss} />
      </div>
    );
  }

  return (
    <div className="group relative flex items-center" style={{ height: 28 }}>
      <div
        className="absolute inset-x-0 opacity-25 group-hover:opacity-50 transition-opacity"
        style={{ top: "50%", height: 1, background: "var(--line)", transform: "translateY(-50%)" }}
      />
      <button
        onClick={onOpen}
        className="relative flex items-center justify-center rounded-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity mx-auto sm:ml-3 sm:mr-0"
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
      </button>
    </div>
  );
}
