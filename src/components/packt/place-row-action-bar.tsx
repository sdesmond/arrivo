"use client";

import { Clock, MapPin, DollarSign, FileText, ChevronDown, Paperclip } from "lucide-react";
import type { TripEvent } from "@/data/types";
import { toHHMM } from "@/lib/utils";

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
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
  place: p,
  showDocs,
  onToggleDocs,
  onOpenTime,
  onOpenLocation,
  onOpenCost,
  onOpenAddDoc,
}: PlaceRowActionBarProps) {
  const docs = p.docs ?? [];
  const hasDocs = docs.length > 0;

  const timeLabel = p.startAt
    ? p.endAt
      ? `${formatTime(toHHMM(p.startAt))} – ${formatTime(toHHMM(p.endAt))}`
      : formatTime(toHHMM(p.startAt))
    : null;

  return (
    <div className="flex items-center gap-1 flex-wrap mt-2">
      {/* Time */}
      <button
        onClick={onOpenTime}
        className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
        style={{
          fontSize: "calc(11px * var(--font-scale))",
          color: p.startAt ? "var(--accent-ink)" : "var(--fg-4)",
          background: p.startAt ? "var(--accent-soft)" : "none",
          border: "1px solid transparent",
        }}
      >
        <Clock size={11} strokeWidth={1.5} />
        {timeLabel ?? "Add time"}
      </button>

      {/* Location */}
      <button
        onClick={onOpenLocation}
        className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
        style={{
          fontSize: "calc(11px * var(--font-scale))",
          color: p.locationAddress ? "var(--accent-ink)" : "var(--fg-4)",
          background: p.locationAddress ? "var(--accent-soft)" : "none",
          border: "1px solid transparent",
          maxWidth: 160,
        }}
      >
        <MapPin size={11} strokeWidth={1.5} style={{ flexShrink: 0 }} />
        <span className="truncate">{p.locationAddress ?? "Add location"}</span>
      </button>

      {/* Cost */}
      <button
        onClick={onOpenCost}
        className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
        style={{
          fontSize: "calc(11px * var(--font-scale))",
          color: p.cost !== undefined ? "var(--accent-ink)" : "var(--fg-4)",
          background: p.cost !== undefined ? "var(--accent-soft)" : "none",
          border: "1px solid transparent",
        }}
      >
        <DollarSign size={11} strokeWidth={1.5} />
        {p.cost !== undefined ? p.cost.toFixed(2) : "Add cost"}
      </button>

      {/* Docs toggle */}
      {hasDocs && (
        <button
          onClick={onToggleDocs}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
          style={{
            fontSize: "calc(11px * var(--font-scale))",
            color: "var(--accent-ink)",
            background: "var(--accent-soft)",
            border: "1px solid transparent",
          }}
        >
          <FileText size={11} strokeWidth={1.5} />
          {docs.length} doc{docs.length !== 1 ? "s" : ""}
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
            fontSize: "calc(11px * var(--font-scale))",
            color: "var(--fg-4)",
            border: "1px solid transparent",
          }}
          title="Attach document"
        >
          <Paperclip size={11} strokeWidth={1.5} />
          Attach
        </button>
      )}
    </div>
  );
}
