"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { type DateRange } from "react-day-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface DateRangePickerProps {
  from?: string;
  to?: string;
  onChange: (from: string | undefined, to: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
}

// Returns which date in `curr` actually changed relative to `prev` — this is the
// date the user physically clicked when react-day-picker adjusts an existing range.
function detectClickedDate(prev: DateRange, curr: DateRange | undefined): Date | undefined {
  if (!curr?.from && !curr?.to) return undefined;
  if (curr.from && prev.from && curr.from.getTime() !== prev.from.getTime()) return curr.from;
  if (curr.to && prev.to && curr.to.getTime() !== prev.to.getTime()) return curr.to;
  if (curr.to && !prev.to) return curr.to;
  return curr.from;
}

export function DateRangePicker({
  from,
  to,
  onChange,
  placeholder = "Pick a date range",
  disabled,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  // Tracks the in-progress range being built by the user's clicks.
  const [selecting, setSelecting] = React.useState<DateRange | undefined>(undefined);
  // False until the user makes their first click; resets each time the picker opens.
  const [interacted, setInteracted] = React.useState(false);

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen) {
      setSelecting(undefined);
      setInteracted(false);
    }
  }

  // The committed values (from props) parsed for Calendar display.
  const committedForDisplay: DateRange | undefined =
    from || to ? { from: from ? parseISO(from) : undefined, to: to ? parseISO(to) : undefined } : undefined;

  // Before the user clicks, show the committed range for highlighting.
  // After first click, show the in-progress selection.
  const calendarSelected = interacted ? selecting : committedForDisplay;

  function handleSelect(range: DateRange | undefined) {
    const committedBothSet = committedForDisplay?.from !== undefined && committedForDisplay?.to !== undefined;

    if (!interacted && committedBothSet) {
      // First click while a complete range is displayed: react-day-picker adjusts
      // that range rather than starting fresh. Detect the actual clicked date and
      // start a new range from scratch to avoid keeping the old end date.
      const clickedDate = detectClickedDate(committedForDisplay!, range);
      if (!clickedDate) return;
      setInteracted(true);
      setSelecting({ from: clickedDate, to: undefined });
      onChange(format(clickedDate, "yyyy-MM-dd"), undefined);
      return;
    }

    setInteracted(true);

    const nextFrom = range?.from ? format(range.from, "yyyy-MM-dd") : undefined;
    const rawTo = range?.to ? format(range.to, "yyyy-MM-dd") : undefined;
    // react-day-picker v10 sets from === to on the very first click (range not started yet);
    // treat that as "from only" so the picker stays open for the end date.
    const nextTo = rawTo !== nextFrom ? rawTo : undefined;

    setSelecting(nextTo ? range : { from: range?.from, to: undefined });
    onChange(nextFrom, nextTo);
    if (nextFrom && nextTo) setOpen(false);
  }

  const hasValue = from || to;
  const initialMonth = from ? parseISO(from) : undefined;

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          disabled={disabled}
          className={cn(buttonVariants({ variant: "outline" }), "flex-1 justify-start font-normal")}
          style={{ color: hasValue ? "var(--fg)" : "var(--fg-3)" }}
        >
          <CalendarIcon size={16} strokeWidth={1.5} className="mr-2 shrink-0" />
          {from ? (
            to ? (
              <>
                {format(parseISO(from), "MMM d, yyyy")} – {format(parseISO(to), "MMM d, yyyy")}
              </>
            ) : (
              format(parseISO(from), "MMM d, yyyy")
            )
          ) : (
            placeholder
          )}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            defaultMonth={calendarSelected?.from ?? initialMonth}
            selected={calendarSelected}
            onSelect={handleSelect}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
      {hasValue && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Clear dates"
          disabled={disabled}
          onClick={() => onChange(undefined, undefined)}
          style={{ color: "var(--fg-3)" }}
        >
          <X size={14} strokeWidth={1.5} />
        </Button>
      )}
    </div>
  );
}
