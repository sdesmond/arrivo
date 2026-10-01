"use client";

import { Clock, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn, toHHMM } from "@/lib/utils";
import { IconSize } from "@/lib/size-tokens";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { useCanEditTrip } from "./trip-edit-access";

const SCHEDULE_CONFLICT_MESSAGE =
  "Not enough travel time between the end of the previous stop and the start of this one.";

function formatTime(timeStr: string): string {
  if (!timeStr) return "—";
  const [hour24, minute] = timeStr.split(":").map(Number);
  if (isNaN(hour24) || isNaN(minute)) return "—";
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour = hour24 % 12 || 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export const CHIP_CLASS = "flex h-11 items-center gap-1 rounded-full px-3 py-0.5";

/** A set value shown to a viewer: same chip shape, but plain text rather than a button. */
export function ReadOnlyChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={CHIP_CLASS}
      style={{
        fontSize: "calc(var(--fs-action-chip) * var(--font-scale))",
        color: "var(--accent-ink)",
        background: "var(--accent-soft)",
      }}
    >
      {children}
    </span>
  );
}

export interface PlaceRowTimeChipProps {
  startAt?: string;
  endAt?: string;
  hasScheduleConflict?: boolean;
  /** False on a dateless trip's day (or an unscheduled event): a time is stored as a full timestamp and needs a date. */
  hasDayDate?: boolean;
  onOpenTime: () => void;
}

export function PlaceRowTimeChip({
  startAt,
  endAt,
  hasScheduleConflict,
  hasDayDate = true,
  onOpenTime,
}: PlaceRowTimeChipProps) {
  const canEditTrip = useCanEditTrip();
  // Saving a time without a date would store nothing, so a dateless day never opens the dialog.
  const canEdit = canEditTrip && hasDayDate;
  const timeLabel = startAt
    ? endAt
      ? `${formatTime(toHHMM(startAt))} – ${formatTime(toHHMM(endAt))}`
      : formatTime(toHHMM(startAt))
    : null;

  return hasScheduleConflict ? (
    <ButtonGroup
      orientation="horizontal"
      className="overflow-hidden rounded-full"
      style={{ background: "var(--warning-soft)", color: "var(--warning-ink)" }}
    >
      {canEdit ? (
        <Button
          variant="ghost"
          size="lg"
          className="hover:bg-surface-2 dark:hover:bg-surface-2 hover:text-inherit focus-visible:ring-inset"
          onClick={onOpenTime}
        >
          <Clock size={IconSize.actionChip} strokeWidth={1.5} style={{ flexShrink: 0 }} />
          {timeLabel ?? "Add time"}
        </Button>
      ) : timeLabel ? (
        <span className="flex h-11 items-center gap-1 pl-3">
          <Clock size={IconSize.actionChip} strokeWidth={1.5} style={{ flexShrink: 0 }} />
          {timeLabel}
        </span>
      ) : null}
      <Button
        variant="ghost"
        size="icon-lg"
        className="hover:bg-surface-2 dark:hover:bg-surface-2 hover:text-inherit focus-visible:ring-inset"
        onClick={() => toast.warning(SCHEDULE_CONFLICT_MESSAGE)}
        aria-label="Schedule conflict"
        title="Schedule conflict"
      >
        <TriangleAlert size={IconSize.actionChip} strokeWidth={1.5} />
      </Button>
    </ButtonGroup>
  ) : !canEdit ? (
    timeLabel ? (
      <ReadOnlyChip>
        <Clock size={IconSize.actionChip} strokeWidth={1.5} />
        {timeLabel}
      </ReadOnlyChip>
    ) : canEditTrip ? (
      <span
        className={CHIP_CLASS}
        style={{ fontSize: "calc(var(--fs-action-chip) * var(--font-scale))", color: "var(--fg-4)" }}
      >
        <Clock size={IconSize.actionChip} strokeWidth={1.5} />
        Set dates to add a time
      </span>
    ) : null
  ) : (
    <button
      onClick={onOpenTime}
      className={cn(CHIP_CLASS, "transition-colors hover:bg-surface-2")}
      style={{
        fontSize: "calc(var(--fs-action-chip) * var(--font-scale))",
        color: startAt ? "var(--accent-ink)" : "var(--fg-4)",
        background: startAt ? "var(--accent-soft)" : "none",
        border: "1px solid transparent",
      }}
    >
      <Clock size={IconSize.actionChip} strokeWidth={1.5} />
      {timeLabel ?? "Add time"}
    </button>
  );
}
