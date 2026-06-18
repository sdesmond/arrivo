"use client";

import { Clock, MapPin, DollarSign, FileText, ChevronDown, Paperclip } from "lucide-react";
import type { TripEvent } from "@/data/types";
import { toHHMM, pluralize } from "@/lib/utils";
import { IconSize } from "@/lib/size-tokens";

function formatTime(timeStr: string): string {
  if (!timeStr) return "—";
  const [hour24, minute] = timeStr.split(":").map(Number);
  if (isNaN(hour24) || isNaN(minute)) return "—";
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour = hour24 % 12 || 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export interface PlaceRowActionBarProps {
  place: TripEvent;
  showDocs: boolean;
  onToggleDocs: () => void;
  onOpenTime: () => void;
  onOpenLocation: () => void;
  onOpenCost: () => void;
  onOpenAddDoc: () => void;
}

export function PlaceRowActionBar({
  place,
  showDocs,
  onToggleDocs,
  onOpenTime,
  onOpenLocation,
  onOpenCost,
  onOpenAddDoc,
}: PlaceRowActionBarProps) {
  const docs = place.docs ?? [];
  const hasDocs = docs.length > 0;

  const timeLabel = place.startAt
    ? place.endAt
      ? `${formatTime(toHHMM(place.startAt))} – ${formatTime(toHHMM(place.endAt))}`
      : formatTime(toHHMM(place.startAt))
    : null;

  return (
    <div className="flex items-center gap-1 flex-wrap mt-2">
      {/* Time */}
      <button
        onClick={onOpenTime}
        className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
        style={{
          fontSize: "calc(var(--fs-action-chip) * var(--font-scale))",
          color: place.startAt ? "var(--accent-ink)" : "var(--fg-4)",
          background: place.startAt ? "var(--accent-soft)" : "none",
          border: "1px solid transparent",
        }}
      >
        <Clock size={IconSize.actionChip} strokeWidth={1.5} />
        {timeLabel ?? "Add time"}
      </button>

      {/* Location */}
      <button
        onClick={onOpenLocation}
        className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
        style={{
          fontSize: "calc(var(--fs-action-chip) * var(--font-scale))",
          color: place.locationAddress ? "var(--accent-ink)" : "var(--fg-4)",
          background: place.locationAddress ? "var(--accent-soft)" : "none",
          border: "1px solid transparent",
          maxWidth: 160,
        }}
      >
        <MapPin size={IconSize.actionChip} strokeWidth={1.5} style={{ flexShrink: 0 }} />
        <span className="truncate">{place.locationAddress ?? "Add location"}</span>
      </button>

      {/* Cost */}
      <button
        onClick={onOpenCost}
        className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
        style={{
          fontSize: "calc(var(--fs-action-chip) * var(--font-scale))",
          color: place.cost !== undefined ? "var(--accent-ink)" : "var(--fg-4)",
          background: place.cost !== undefined ? "var(--accent-soft)" : "none",
          border: "1px solid transparent",
        }}
      >
        <DollarSign size={IconSize.actionChip} strokeWidth={1.5} />
        {place.cost !== undefined
          ? new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(place.cost)
          : "Add cost"}
      </button>

      {/* Docs toggle */}
      {hasDocs && (
        <button
          onClick={onToggleDocs}
          aria-expanded={showDocs}
          title="Show attached documents"
          className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
          style={{
            fontSize: "calc(var(--fs-action-chip) * var(--font-scale))",
            color: "var(--accent-ink)",
            background: "var(--accent-soft)",
            border: "1px solid transparent",
          }}
        >
          <FileText size={IconSize.actionChip} strokeWidth={1.5} />
          {pluralize(docs.length, "doc")}
          <ChevronDown
            size={10}
            style={{
              transform: showDocs ? "rotate(180deg)" : undefined,
              transition: "transform 0.15s",
            }}
          />
        </button>
      )}

      {/* Attach button — only when no docs */}
      {!hasDocs && (
        <button
          onClick={onOpenAddDoc}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
          style={{
            fontSize: "calc(var(--fs-action-chip) * var(--font-scale))",
            color: "var(--fg-4)",
            border: "1px solid transparent",
          }}
          title="Attach document"
        >
          <Paperclip size={IconSize.actionChip} strokeWidth={1.5} />
          Attach
        </button>
      )}
    </div>
  );
}
