"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import type { CurrencyOption } from "@/data/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface CurrencyPickerProps {
  currencyOptions: CurrencyOption[];
  value?: string;
  onChange: (currency: string) => void;
  disabled?: boolean;
}

function queueFocus(callback: () => void): void {
  if (typeof window === "undefined") {
    return;
  }

  window.requestAnimationFrame(callback);
}

function clampCurrencyIndex(index: number, optionCount: number): number {
  if (index < 0) {
    return optionCount - 1;
  }

  if (index >= optionCount) {
    return 0;
  }

  return index;
}

export function CurrencyPicker({
  currencyOptions,
  value = "USD",
  onChange,
  disabled = false,
}: CurrencyPickerProps): ReactElement {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const selectedIndex = currencyOptions.findIndex((option) => option.code === value);
  const fallbackOption: CurrencyOption = { code: value, name: value };
  const selectedOption = selectedIndex >= 0 ? currencyOptions[selectedIndex] : fallbackOption;
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex >= 0 ? selectedIndex : 0);

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
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  function closePicker(): void {
    setIsOpen(false);
    queueFocus(() => {
      triggerRef.current?.focus();
    });
  }

  function openPicker(): void {
    if (disabled || currencyOptions.length === 0) {
      return;
    }

    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setIsOpen(true);
  }

  function handleSelect(code: string): void {
    onChange(code);
    closePicker();
  }

  function moveActiveIndex(step: number): void {
    const nextIndex = clampCurrencyIndex(activeIndex + step, currencyOptions.length);
    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (isOpen) {
          moveActiveIndex(1);
          break;
        }

        openPicker();
        break;
      case "ArrowUp":
        event.preventDefault();
        if (isOpen) {
          moveActiveIndex(-1);
          break;
        }

        openPicker();
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        openPicker();
        break;
      case "Escape":
        if (!isOpen) {
          break;
        }

        event.preventDefault();
        closePicker();
        break;
      default:
        break;
    }
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, optionCode: string): void {
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
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(currencyOptions.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        handleSelect(optionCode);
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
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        className="w-full justify-between"
        disabled={disabled || currencyOptions.length === 0}
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`Currency: ${selectedOption.name} ${selectedOption.code}`}
        onClick={() => {
          if (isOpen) {
            closePicker();
            return;
          }

          openPicker();
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span
            className="inline-flex h-8 min-w-14 items-center justify-center rounded-md border px-2 text-xs font-semibold"
            style={{
              borderColor: "var(--line)",
              background: "var(--surface-2)",
              color: "var(--fg)",
              fontFamily: "var(--font-body, ui-sans-serif)",
            }}
          >
            {selectedOption.code}
          </span>
          <span className="truncate text-left">{selectedOption.name}</span>
        </span>
        <span className="text-xs uppercase tracking-[0.12em]" style={{ color: "var(--fg-3)" }}>
          {selectedOption.code}
        </span>
      </Button>

      {isOpen ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Currency options"
          className="absolute left-0 top-full z-30 mt-2 w-full overflow-hidden rounded-xl"
          style={{
            border: "1px solid var(--line)",
            background: "var(--surface)",
            boxShadow: "0 18px 36px color-mix(in srgb, var(--fg) 12%, transparent)",
          }}
        >
          <ScrollArea className="h-80">
            <div className="p-2">
              {currencyOptions.map((option, index) => {
                const isSelected = option.code === selectedOption.code;

                return (
                  <button
                    key={option.code}
                    ref={(element) => {
                      optionRefs.current[index] = element;
                    }}
                    type="button"
                    role="option"
                    aria-label={`${option.name} ${option.code}`}
                    aria-selected={isSelected}
                    data-selected={isSelected ? "true" : "false"}
                    tabIndex={index === activeIndex ? 0 : -1}
                    className={cn(
                      "flex h-10 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none transition-colors",
                      index === activeIndex && "ring-2 ring-ring/50"
                    )}
                    style={{
                      background: isSelected ? "var(--accent-soft)" : "transparent",
                      color: isSelected ? "var(--accent-fg)" : "var(--fg)",
                    }}
                    onClick={() => handleSelect(option.code)}
                    onFocus={() => setActiveIndex(index)}
                    onKeyDown={(event) => handleOptionKeyDown(event, option.code)}
                  >
                    <span
                      className="inline-flex h-8 min-w-14 items-center justify-center rounded-md border px-2 text-xs font-semibold"
                      style={{
                        borderColor: isSelected ? "var(--accent-brand)" : "var(--line)",
                        background: isSelected ? "var(--surface)" : "var(--surface-2)",
                        color: "inherit",
                        fontFamily: "var(--font-body, ui-sans-serif)",
                      }}
                    >
                      {option.code}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{option.name}</span>
                    <span className="text-xs uppercase tracking-[0.12em]" style={{ color: "inherit" }}>
                      {option.code}
                    </span>
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
