"use client";

import { MapPin, DollarSign, FileText, ChevronDown, Paperclip, Pencil } from "lucide-react";
import type { TripEvent } from "@/data/types";
import { cn, pluralize, getLocationDisplayLabel } from "@/lib/utils";
import { IconSize } from "@/lib/size-tokens";
import { formatCurrencyChipAmount } from "@/lib/currencies";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { CHIP_CLASS, PlaceRowTimeChip, ReadOnlyChip } from "./place-row-action-chips";
import { useCanEditTrip } from "./trip-edit-access";

export interface PlaceRowActionBarProps {
  place: TripEvent;
  showDocs: boolean;
  onToggleDocs: () => void;
  onOpenTime: () => void;
  onOpenLocation: () => void;
  onOpenCost: () => void;
  onOpenAddDoc: () => void;
  onOpenMaps?: () => void;
  hasScheduleConflict?: boolean;
  hasDayDate?: boolean;
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
  hasScheduleConflict,
  hasDayDate,
}: PlaceRowActionBarProps) {
  const canEdit = useCanEditTrip();
  const docs = place.docs ?? [];
  const hasDocs = docs.length > 0;

  const locationLabel = getLocationDisplayLabel(place.locationName, place.locationAddress);

  return (
    <div className="flex items-center gap-2 flex-wrap mt-2">
      <PlaceRowTimeChip
        startAt={place.startAt}
        endAt={place.endAt}
        hasScheduleConflict={hasScheduleConflict}
        hasDayDate={hasDayDate}
        onOpenTime={onOpenTime}
      />

      {/* Location */}
      {place.locationAddress ? (
        <ButtonGroup
          orientation="horizontal"
          className="overflow-hidden rounded-full"
          style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}
        >
          <Button
            variant="ghost"
            size="lg"
            className="hover:bg-surface-2 dark:hover:bg-surface-2 hover:text-inherit focus-visible:ring-inset"
            onClick={() => (onOpenMaps ? onOpenMaps() : undefined)}
            aria-label={`Open directions to ${locationLabel}`}
          >
            <MapPin size={IconSize.actionChip} strokeWidth={1.5} style={{ flexShrink: 0 }} />
            <span className="truncate" style={{ maxWidth: 160 }}>
              {locationLabel}
            </span>
          </Button>
          {canEdit && (
            <Button
              variant="ghost"
              size="icon-lg"
              className="hover:bg-surface-2 dark:hover:bg-surface-2 hover:text-inherit focus-visible:ring-inset"
              onClick={onOpenLocation}
              aria-label="Edit location"
              title="Edit location"
            >
              <Pencil size={IconSize.actionChip} strokeWidth={1.5} />
            </Button>
          )}
        </ButtonGroup>
      ) : !canEdit ? (
        locationLabel && (
          <ReadOnlyChip>
            <MapPin size={IconSize.actionChip} strokeWidth={1.5} style={{ flexShrink: 0 }} />
            <span className="truncate" style={{ maxWidth: 160 }}>
              {locationLabel}
            </span>
          </ReadOnlyChip>
        )
      ) : (
        <button
          onClick={onOpenLocation}
          className={cn(CHIP_CLASS, "transition-colors hover:bg-surface-2")}
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
      {!canEdit ? (
        place.expense && (
          <ReadOnlyChip>{formatCurrencyChipAmount(place.expense.amount, place.expense.currency)}</ReadOnlyChip>
        )
      ) : (
        <button
          onClick={onOpenCost}
          className={cn(CHIP_CLASS, "transition-colors hover:bg-surface-2")}
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
      )}

      {/* Docs toggle */}
      {hasDocs && (
        <button
          onClick={onToggleDocs}
          aria-expanded={showDocs}
          title="Show attached documents"
          className="flex h-11 items-center gap-1 rounded-full px-3 py-0.5 transition-colors hover:bg-surface-2"
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
      {canEdit && !hasDocs && (
        <button
          onClick={onOpenAddDoc}
          className="flex h-11 items-center gap-1 rounded-full px-3 py-0.5 transition-colors hover:bg-surface-2"
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
