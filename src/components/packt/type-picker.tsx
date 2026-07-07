"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { MapPin, FileText, ListChecks, Backpack } from "lucide-react";
import { ItineraryItemType } from "@/data/types";

export interface TypePickerProps {
  onSelect: (type: ItineraryItemType) => void;
  onDismiss: () => void;
  onOpenPackingListPicker?: () => void;
}

interface PickerOptionProps {
  autoFocus?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  title: string;
}

function PickerOption({ autoFocus, icon, label, onClick, title }: PickerOptionProps) {
  return (
    <button
      autoFocus={autoFocus}
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-3 rounded-[4px] px-3 py-2 text-left transition-colors hover:bg-surface-2"
      style={{
        color: "var(--fg-3)",
        background: "none",
        border: "none",
        cursor: "pointer",
        fontSize: "calc(13px * var(--font-scale))",
      }}
      title={title}
    >
      <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

export function TypePicker({ onSelect, onDismiss, onOpenPackingListPicker }: TypePickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  function handleOpenPackingListPicker(): void {
    onDismiss();
    onOpenPackingListPicker?.();
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }
    function handleMouseDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
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
      className="inline-flex min-w-40 flex-col items-stretch gap-0.5 px-1 py-1 rounded-[6px]"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      }}
    >
      <PickerOption
        autoFocus
        icon={<MapPin size={15} strokeWidth={1.5} />}
        label="Event"
        onClick={() => onSelect(ItineraryItemType.Event)}
        title="Add event"
      />
      <PickerOption
        icon={<FileText size={15} strokeWidth={1.5} />}
        label="Note"
        onClick={() => onSelect(ItineraryItemType.Note)}
        title="Add note"
      />
      <PickerOption
        icon={<ListChecks size={15} strokeWidth={1.5} />}
        label="Checklist"
        onClick={() => onSelect(ItineraryItemType.Checklist)}
        title="Add checklist"
      />
      {onOpenPackingListPicker && (
        <PickerOption
          icon={<Backpack size={15} strokeWidth={1.5} />}
          label="Packing list"
          onClick={handleOpenPackingListPicker}
          title="Insert packing list"
        />
      )}
    </div>
  );
}
