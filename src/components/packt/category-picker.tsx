"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { ChevronDown } from "lucide-react";
import { ExpenseCategory, type ExpenseCategory as ExpenseCategoryValue } from "@/data/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const CATEGORY_OPTIONS: Array<{ value: ExpenseCategoryValue; label: string }> = [
  { value: ExpenseCategory.Food, label: "Food" },
  { value: ExpenseCategory.Lodging, label: "Lodging" },
  { value: ExpenseCategory.Transport, label: "Transport" },
  { value: ExpenseCategory.Activity, label: "Activity" },
  { value: ExpenseCategory.Sightseeing, label: "Sightseeing" },
  { value: ExpenseCategory.Gas, label: "Gas" },
  { value: ExpenseCategory.Groceries, label: "Groceries" },
  { value: ExpenseCategory.Flights, label: "Flights" },
  { value: ExpenseCategory.CarRental, label: "Car Rental" },
  { value: ExpenseCategory.Shopping, label: "Shopping" },
  { value: ExpenseCategory.Misc, label: "Misc" },
];

function queueFocus(callback: () => void): void {
  if (typeof window === "undefined") {
    return;
  }

  window.requestAnimationFrame(callback);
}

function clampOptionIndex(index: number): number {
  if (index < 0) {
    return CATEGORY_OPTIONS.length - 1;
  }

  if (index >= CATEGORY_OPTIONS.length) {
    return 0;
  }

  return index;
}

export interface CategoryPickerProps {
  value?: ExpenseCategoryValue;
  onChange: (category: ExpenseCategoryValue) => void;
  disabled?: boolean;
  error?: boolean;
  required?: boolean;
}

export function CategoryPicker({
  value,
  onChange,
  disabled = false,
  error = false,
  required = false,
}: CategoryPickerProps): ReactElement {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const selectedIndex = CATEGORY_OPTIONS.findIndex((option) => option.value === value);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex >= 0 ? selectedIndex : 0);
  const selectedOption = selectedIndex >= 0 ? CATEGORY_OPTIONS[selectedIndex] : undefined;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    queueFocus(() => {
      optionRefs.current[activeIndex]?.focus();
    });
  }, [activeIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent): void {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }

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
    if (disabled) {
      return;
    }

    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setIsOpen(true);
  }

  function moveActiveIndex(step: number): void {
    const nextIndex = clampOptionIndex(activeIndex + step);
    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
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
        if (!isOpen) {
          return;
        }

        event.preventDefault();
        closePicker();
        break;
      default:
        break;
    }
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, category: ExpenseCategoryValue): void {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActiveIndex(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActiveIndex(-1);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        optionRefs.current[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(CATEGORY_OPTIONS.length - 1);
        optionRefs.current[CATEGORY_OPTIONS.length - 1]?.focus();
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        onChange(category);
        closePicker();
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
    <div ref={rootRef} className="relative">
      {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props -- listbox-trigger button must surface aria-required per Accessibility Floor spec */}
      <button
        ref={triggerRef}
        type="button"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-required={required}
        disabled={disabled}
        className="flex h-10 w-full items-center justify-between rounded-xl border px-3 text-left outline-none disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          borderColor: error ? "var(--destructive)" : "var(--input)",
          color: selectedOption ? "var(--fg)" : "var(--fg-3)",
          background: "var(--surface)",
        }}
        onClick={() => {
          if (isOpen) {
            closePicker();
            return;
          }

          openPicker();
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{selectedOption?.label ?? "Select category"}</span>
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
          <ScrollArea className="max-h-80">
            <div id={listboxId} role="listbox" aria-label="Expense categories" className="p-2">
              {CATEGORY_OPTIONS.map((option, index) => {
                const isSelected = option.value === value;

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
                      "flex h-10 w-full items-center rounded-lg px-2 py-1.5 text-left outline-none transition-colors",
                      index === activeIndex && "ring-2 ring-ring/50"
                    )}
                    style={{
                      background: isSelected ? "var(--accent-soft)" : "transparent",
                      color: isSelected ? "var(--accent-fg)" : "var(--fg)",
                    }}
                    onClick={() => {
                      onChange(option.value);
                      closePicker();
                    }}
                    onFocus={() => setActiveIndex(index)}
                    onKeyDown={(event) => handleOptionKeyDown(event, option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      ) : null}
    </div>
  );
}
