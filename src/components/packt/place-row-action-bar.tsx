"use client";

import { Clock, MapPin, DollarSign, FileText, ChevronDown, Paperclip, Pencil } from "lucide-react";
import type { TripEvent } from "@/data/types";
import { toHHMM, pluralize, getLocationDisplayLabel } from "@/lib/utils";
import { IconSize } from "@/lib/size-tokens";
import { formatCurrencyChipAmount } from "@/lib/currencies";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";

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
  onOpenMaps?: () => void;
}

export function PlaceRowActionBar({
  place,
  showDocs,
  onToggleDocs,
  onOpenTime,
  onOpenLocation,
  onOpenCost,
  onOpenAddDoc,
  onOpenMaps,
}: PlaceRowActionBarProps) {
  const docs = place.docs ?? [];
  const hasDocs = docs.length > 0;

  const timeLabel = place.startAt
    ? place.endAt
      ? `${formatTime(toHHMM(place.startAt))} – ${formatTime(toHHMM(place.endAt))}`
      : formatTime(toHHMM(place.startAt))
    : null;
  const locationLabel = getLocationDisplayLabel(place.locationName, place.locationAddress);

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
      {place.locationAddress ? (
        <ButtonGroup orientation="horizontal">
          <Button
            variant="outline"
            size="lg"
            onClick={() => (onOpenMaps ? onOpenMaps() : undefined)}
            aria-label={`Open directions to ${locationLabel}`}
            style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}
          >
            <MapPin size={IconSize.actionChip} strokeWidth={1.5} style={{ flexShrink: 0 }} />
            <span className="truncate" style={{ maxWidth: 160 }}>
              {locationLabel}
            </span>
          </Button>
          <Button
            variant="outline"
            size="icon-lg"
            onClick={onOpenLocation}
            aria-label="Edit location"
            title="Edit location"
            style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}
          >
            <Pencil size={IconSize.actionChip} strokeWidth={1.5} />
          </Button>
        </ButtonGroup>
      ) : (
        <button
          onClick={onOpenLocation}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
          style={{
            fontSize: "calc(var(--fs-action-chip) * var(--font-scale))",
            color: "var(--fg-4)",
            border: "1px solid transparent",
            maxWidth: 160,
          }}
        >
          <MapPin size={IconSize.actionChip} strokeWidth={1.5} style={{ flexShrink: 0 }} />
          <span className="truncate">{locationLabel || "Add location"}</span>
        </button>
      )}

      {/* Cost */}
      <button
        onClick={onOpenCost}
        className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
        style={{
          fontSize: "calc(var(--fs-action-chip) * var(--font-scale))",
          color: place.expense ? "var(--accent-ink)" : "var(--fg-4)",
          background: place.expense ? "var(--accent-soft)" : "none",
          border: "1px solid transparent",
        }}
      >
        {place.expense ? (
          formatCurrencyChipAmount(place.expense.amount, place.expense.currency)
        ) : (
          <>
            <DollarSign size={IconSize.actionChip} strokeWidth={1.5} />
            Add cost
          </>
        )}
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
