"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";
import { cn, isEventNow, isEventPast } from "@/lib/utils";
import { IconSize } from "@/lib/size-tokens";
import { type TripEvent } from "@/data/types";

interface EventChipProps {
  ev: TripEvent;
  tripId: string;
  now: Date;
}

export function EventChip({ ev, tripId, now }: EventChipProps) {
  const isNow = isEventNow(ev, now);
  const isPast = isEventPast(ev, now);
  const timeStr = ev.startAt
    ? new Date(ev.startAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : "";

  return (
    <Link
      href={`/trips/${tripId}`}
      className={cn(
        "flex flex-col gap-0.5 px-2.5 py-2 rounded-[8px] transition-colors min-w-[88px]",
        "hover:bg-surface-2",
        isNow && "border-[1.5px]"
      )}
      style={{
        opacity: isPast ? 0.55 : 1,
        background: isNow ? "var(--accent-soft)" : undefined,
        borderColor: isNow ? "var(--accent-brand)" : undefined,
      }}
      title={`Open ${ev.name} in day planner`}
    >
      <div
        style={{
          fontFamily: "var(--font-mono-family, ui-monospace)",
          fontSize: "calc(var(--fs-chip-meta) * var(--font-scale))",
          fontWeight: 500,
          letterSpacing: "0.04em",
          color: isNow ? "var(--accent-brand)" : "var(--fg-3)",
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        <MapPin size={IconSize.chipMeta} strokeWidth={1.5} />
        {timeStr}
        {isNow ? " · NOW" : isPast ? " · DONE" : ""}
      </div>
      <div
        style={{
          fontSize: "calc(var(--fs-chip-name) * var(--font-scale))",
          fontWeight: 500,
          color: "var(--fg)",
          lineHeight: 1.2,
        }}
      >
        {ev.name}
      </div>
    </Link>
  );
}
