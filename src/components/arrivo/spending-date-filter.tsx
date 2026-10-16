"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { ChevronDown } from "lucide-react";
import { SpendingDateRange } from "@/data/types";
import { cn, pluralize } from "@/lib/utils";

const RANGE_OPTIONS: { value: SpendingDateRange; label: string }[] = [
  { value: SpendingDateRange.ThisYear, label: "This Year" },
  { value: SpendingDateRange.LastYear, label: "Last Year" },
  { value: SpendingDateRange.Last12Months, label: "Last 12 Months" },
  { value: SpendingDateRange.AllTime, label: "All Time" },
];

function queueFocus(callback: () => void): void {
  if (typeof window === "undefined") {
    return;
  }
  window.requestAnimationFrame(callback);
}

function clampOptionIndex(index: number): number {
  if (index < 0) return RANGE_OPTIONS.length - 1;
  if (index >= RANGE_OPTIONS.length) return 0;
  return index;
}

export interface SpendingDateFilterProps {
  range: SpendingDateRange;
  onChange: (range: SpendingDateRange) => void;
  tripCount: number;
}

export function SpendingDateFilter({ range, onChange, tripCount }: SpendingDateFilterProps): ReactElement {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const helperId = useId();
  const selectedIndex = RANGE_OPTIONS.findIndex((option) => option.value === range);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex >= 0 ? selectedIndex : 0);
  const selectedOption = selectedIndex >= 0 ? RANGE_OPTIONS[selectedIndex] : RANGE_OPTIONS[0];
  const announcement = `Showing ${selectedOption.label} — ${tripCount} ${pluralize(tripCount, "trip")}`;

  useEffect(() => {
    if (!isOpen) return;
    queueFocus(() => optionRefs.current[activeIndex]?.focus());
  }, [activeIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent): void {
      if (rootRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
      queueFocus(() => triggerRef.current?.focus());
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  function closePicker(): void {
    setIsOpen(false);
    queueFocus(() => triggerRef.current?.focus());
  }

  function openPicker(): void {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setIsOpen(true);
  }

  function moveActiveIndex(step: number): void {
    const nextIndex = clampOptionIndex(activeIndex + step);
    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
  }

  function selectRange(nextRange: SpendingDateRange): void {
    onChange(nextRange);
    closePicker();
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
      case "Enter":
      case " ":
        event.preventDefault();
        openPicker();
        break;
      case "Escape":
        if (!isOpen) return;
        event.preventDefault();
        closePicker();
        break;
      default:
        break;
    }
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, optionValue: SpendingDateRange): void {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActiveIndex(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActiveIndex(-1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        selectRange(optionValue);
        break;
      case "Escape":
        event.preventDefault();
        closePicker();
        break;
      case "Tab":
        setIsOpen(false);
        break;
      default:
        break;
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div ref={rootRef} className="relative">
        <button
          ref={triggerRef}
          type="button"
          aria-label="Date Range"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-describedby={helperId}
          className="flex h-11 min-w-44 items-center justify-between gap-2 rounded-xl border px-4 text-left outline-none"
          style={{ borderColor: "var(--input)", color: "var(--fg)", background: "var(--surface)" }}
          onClick={() => (isOpen ? closePicker() : openPicker())}
          onKeyDown={handleTriggerKeyDown}
        >
          <span>{selectedOption.label}</span>
          <ChevronDown className="size-4" strokeWidth={1.5} style={{ color: "var(--fg-3)" }} />
        </button>

        {isOpen ? (
          <div
            className="absolute left-0 top-full z-30 mt-2 w-full overflow-hidden rounded-xl"
            style={{
              border: "1px solid var(--line)",
              background: "var(--surface)",
              boxShadow: "0 18px 36px color-mix(in srgb, var(--fg) 12%, transparent)",
            }}
          >
            <div id={listboxId} role="listbox" aria-label="Date Range" className="p-2">
              {RANGE_OPTIONS.map((option, index) => {
                const isSelected = option.value === range;

                return (
                  <button
                    key={option.value}
                    ref={(element) => {
                      optionRefs.current[index] = element;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={index === activeIndex ? 0 : -1}
                    className={cn(
                      "flex h-11 w-full items-center rounded-lg px-3 text-left outline-none transition-colors",
                      index === activeIndex && "ring-2 ring-ring/50"
                    )}
                    style={{
                      background: isSelected ? "var(--accent-soft)" : "transparent",
                      color: isSelected ? "var(--accent-ink)" : "var(--fg)",
                    }}
                    onClick={() => selectRange(option.value)}
                    onFocus={() => setActiveIndex(index)}
                    onKeyDown={(event) => handleOptionKeyDown(event, option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <p id={helperId} style={{ color: "var(--fg-3)", fontSize: "calc(13px * var(--font-scale))" }}>
        Includes any trip overlapping this period.
      </p>

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
