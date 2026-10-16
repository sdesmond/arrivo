"use client";

import { ChevronRight, type LucideIcon } from "lucide-react";
import type { TripEvent } from "@/data/types";
import { LinkedEventBadge } from "./linked-event-badge";

export interface PlaceRowLinkedEventProps {
  place: TripEvent;
  onLinkedEventTap?: (linkedReservationId: string) => void;
  linkedAriaLabel?: string;
  linkedMetaLabel?: string;
  LinkedIcon?: LucideIcon;
  isCombinedLinkedEvent?: boolean;
}

export function PlaceRowLinkedEvent({
  place,
  onLinkedEventTap,
  linkedAriaLabel,
  linkedMetaLabel,
}: PlaceRowLinkedEventProps) {
  return (
    <button
      type="button"
      onClick={() => place.linkedReservationId && onLinkedEventTap?.(place.linkedReservationId)}
      aria-label={linkedAriaLabel}
      className="flex w-full items-start justify-between gap-3 rounded-[8px] text-left"
      style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span
            style={{
              fontSize: "calc(14px * var(--font-scale))",
              fontWeight: 600,
              color: "var(--fg)",
              lineHeight: 1.2,
            }}
          >
            {place.name}
          </span>
          <LinkedEventBadge />
        </div>
        {linkedMetaLabel && (
          <div
            style={{
              marginTop: 6,
              fontSize: "calc(var(--fs-card-sub) * var(--font-scale))",
              color: "var(--fg-2)",
              lineHeight: 1.5,
            }}
          >
            {linkedMetaLabel}
          </div>
        )}
      </div>
      <ChevronRight aria-hidden="true" size={16} strokeWidth={1.5} style={{ color: "var(--fg-4)", flexShrink: 0 }} />
    </button>
  );
}
