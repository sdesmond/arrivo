"use client";

import { useState } from "react";
import { MapPin, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { type DayItinerary } from "@/data/types";
import { cn } from "@/lib/utils";

export interface DayCardHeaderProps {
  dateDisplay: string;
  isToday: boolean;
  stopsCount: number;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  dayNumber: number;
  onUpdateDay?: (dayNumber: number, updates: Partial<DayItinerary>) => void;
}

export function DayCardHeader({
  dateDisplay,
  isToday,
  stopsCount,
  subtitle,
  open,
  onToggle,
  dayNumber,
  onUpdateDay,
}: DayCardHeaderProps) {
  const [isEditingSubtitle, setIsEditingSubtitle] = useState(false);
  const [draftSubtitle, setDraftSubtitle] = useState(subtitle ?? "");

  function saveSubtitle() {
    const val = draftSubtitle.trim() || undefined;
    if (val !== subtitle) onUpdateDay?.(dayNumber, { subtitle: val });
    setIsEditingSubtitle(false);
  }

  return (
    <div
      className={cn("rounded-t-[10px]", !open && "rounded-b-[10px]")}
      style={{
        background: isToday ? "var(--accent-soft)" : "var(--surface)",
        borderBottom: open ? "1px solid var(--line)" : "none",
      }}
    >
      <button
        className="w-full flex items-center justify-between gap-3 px-4 pt-3 pb-1.5 text-left transition-colors hover:opacity-90"
        style={{ cursor: "pointer", background: "none", border: "none" }}
        onClick={onToggle}
        aria-expanded={open}
      >
        <div
          style={{
            fontFamily: "var(--font-heading-family, ui-sans-serif)",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--fg)",
          }}
        >
          {dateDisplay}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1" style={{ fontSize: 12, color: "var(--fg-3)" }}>
            <MapPin size={12} strokeWidth={1.5} />
            {stopsCount} stops
          </span>
          {isToday && <Badge variant="soft">Active</Badge>}
          <ChevronDown
            size={14}
            strokeWidth={1.5}
            style={{
              color: "var(--fg-4)",
              transform: open ? "rotate(180deg)" : undefined,
              transition: "transform 0.15s",
              flexShrink: 0,
            }}
          />
        </div>
      </button>

      <div className="px-4 pb-2.5">
        {isEditingSubtitle ? (
          <input
            autoFocus
            value={draftSubtitle}
            placeholder="Add a note"
            onChange={(e) => setDraftSubtitle(e.target.value)}
            onBlur={saveSubtitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveSubtitle();
              if (e.key === "Escape") {
                setDraftSubtitle(subtitle ?? "");
                setIsEditingSubtitle(false);
              }
            }}
            style={{
              fontSize: 12,
              color: "var(--fg-3)",
              background: "transparent",
              border: "none",
              borderBottom: "1px solid var(--accent-brand)",
              outline: "none",
              width: "100%",
              fontFamily: "inherit",
              padding: "1px 0",
            }}
          />
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setDraftSubtitle(subtitle ?? "");
              setIsEditingSubtitle(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                setDraftSubtitle(subtitle ?? "");
                setIsEditingSubtitle(true);
              }
            }}
            style={{
              fontSize: 12,
              color: subtitle ? "var(--fg-3)" : "var(--fg-4)",
              cursor: "text",
              minHeight: "1.2em",
              width: "fit-content",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {subtitle ?? "Add a note"}
          </div>
        )}
      </div>
    </div>
  );
}
