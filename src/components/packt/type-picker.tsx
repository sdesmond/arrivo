"use client";

import { useEffect, useRef } from "react";
import { MapPin, FileText } from "lucide-react";
import { ItineraryItemType } from "@/data/types";

export interface TypePickerProps {
  onSelect: (type: ItineraryItemType) => void;
  onDismiss: () => void;
}

export function TypePicker({ onSelect, onDismiss }: TypePickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onDismiss();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [onDismiss]);

  return (
    <div
      ref={ref}
      className="inline-flex items-center gap-0.5 px-1 py-1 rounded-[6px]"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      }}
    >
      <button
        autoFocus
        onClick={() => onSelect(ItineraryItemType.Event)}
        className="flex items-center justify-center rounded-[4px] p-1.5 transition-colors hover:bg-surface-2"
        style={{ color: "var(--fg-3)", background: "none", border: "none", cursor: "pointer" }}
        title="Add event"
      >
        <MapPin size={15} strokeWidth={1.5} />
      </button>
      <button
        onClick={() => onSelect(ItineraryItemType.Note)}
        className="flex items-center justify-center rounded-[4px] p-1.5 transition-colors hover:bg-surface-2"
        style={{ color: "var(--fg-3)", background: "none", border: "none", cursor: "pointer" }}
        title="Add note"
      >
        <FileText size={15} strokeWidth={1.5} />
      </button>
    </div>
  );
}
