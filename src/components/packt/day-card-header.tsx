"use client";

import { useState } from "react";
import type { ReactElement } from "react";
import { MapPin, ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconSize } from "@/lib/size-tokens";
import type { DayItinerary } from "@/data/types";

export interface DayCardHeaderProps {
  dateDisplay: string;
  isToday: boolean;
  stopsCount: number;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  dayNumber: number;
  onUpdateDay?: (dayNumber: number, updates: Partial<DayItinerary>) => void;
  onRemove?: () => void;
  removeDisabled?: boolean;
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
  onRemove,
  removeDisabled = false,
}: DayCardHeaderProps): ReactElement {
  const [isEditingSubtitle, setIsEditingSubtitle] = useState(false);
  const [draftSubtitle, setDraftSubtitle] = useState(subtitle ?? "");

  function saveSubtitle(): void {
    const val = draftSubtitle.trim() || undefined;
    if (val !== subtitle) onUpdateDay?.(dayNumber, { subtitle: val });
    setIsEditingSubtitle(false);
  }

  return (
    <div
      style={{
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
        borderBottomLeftRadius: open ? undefined : 14,
        borderBottomRightRadius: open ? undefined : 14,
        background: isToday ? "var(--accent-soft)" : "var(--surface)",
        borderBottom: open ? "1px solid var(--line)" : "none",
      }}
    >
      <div className="flex items-center pr-2">
        <button
          className="flex flex-1 items-center justify-between gap-3 px-4 pt-3 pb-1.5 text-left transition-colors hover:opacity-90"
          style={{ cursor: "pointer", background: "none", border: "none" }}
          onClick={onToggle}
          aria-expanded={open}
        >
          <div
            style={{
              fontFamily: "var(--font-heading-family, ui-sans-serif)",
              fontSize: "calc(var(--fs-card-title) * var(--font-scale))",
              fontWeight: 600,
              color: "var(--fg)",
            }}
          >
            {dateDisplay}
          </div>
          <div className="flex items-center gap-2">
            <span
              className="flex items-center gap-1"
              style={{ fontSize: "calc(var(--fs-card-sub) * var(--font-scale))", color: "var(--fg-3)" }}
            >
              <MapPin size={IconSize.cardSub} strokeWidth={1.5} />
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
        {onRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            title="Remove day"
            aria-label="Remove day"
            disabled={removeDisabled}
            onClick={onRemove}
          >
            <Trash2 strokeWidth={1.5} />
          </Button>
        )}
      </div>

      <div
        className="px-4 pb-2.5"
        onClick={!isEditingSubtitle ? onToggle : undefined}
        style={{ cursor: isEditingSubtitle ? undefined : "pointer" }}
      >
        {isEditingSubtitle ? (
          <span style={{ display: "inline-grid", minWidth: "6ch", maxWidth: "100%" }}>
            <input
              autoFocus
              value={draftSubtitle}
              placeholder="Add a note"
              onChange={(event) => setDraftSubtitle(event.target.value)}
              onBlur={saveSubtitle}
              onKeyDown={(event) => {
                if (event.key === "Enter") saveSubtitle();
                if (event.key === "Escape") {
                  setDraftSubtitle(subtitle ?? "");
                  setIsEditingSubtitle(false);
                }
              }}
              style={{
                gridArea: "1 / 1",
                fontSize: "calc(var(--fs-card-sub) * var(--font-scale))",
                color: "var(--fg-3)",
                background: "transparent",
                border: "none",
                borderBottom: "1px solid var(--accent-brand)",
                width: "100%",
                fontFamily: "inherit",
                padding: "1px 0",
              }}
            />
            <span
              aria-hidden
              style={{
                gridArea: "1 / 1",
                visibility: "hidden",
                fontSize: "calc(var(--fs-card-sub) * var(--font-scale))",
                fontFamily: "inherit",
                padding: "1px 0",
                whiteSpace: "pre",
              }}
            >
              {draftSubtitle || "Add a note"}
            </span>
          </span>
        ) : (
          <button
            type="button"
            className="text-left"
            onClick={(event) => {
              event.stopPropagation();
              setDraftSubtitle(subtitle ?? "");
              setIsEditingSubtitle(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.stopPropagation();
                setDraftSubtitle(subtitle ?? "");
                setIsEditingSubtitle(true);
              }
            }}
            style={{
              fontSize: "calc(var(--fs-card-sub) * var(--font-scale))",
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
          </button>
        )}
      </div>
    </div>
  );
}
