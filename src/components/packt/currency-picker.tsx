"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent, ReactElement } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { CurrencyOption } from "@/data/types";
import { getCurrencySymbol } from "@/lib/currencies";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface CurrencyPickerProps {
  currencyOptions: CurrencyOption[];
  value?: string;
  onChange: (currency: string) => void;
  disabled?: boolean;
  searchable?: boolean;
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

function matchesQuery(option: CurrencyOption, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return option.name.toLowerCase().includes(normalizedQuery) || option.code.toLowerCase().includes(normalizedQuery);
}

export function CurrencyPicker({
  currencyOptions,
  value = "USD",
  onChange,
  disabled = false,
  searchable = true,
}: CurrencyPickerProps): ReactElement {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const selectedIndex = currencyOptions.findIndex((option) => option.code === value);
  const fallbackOption: CurrencyOption = { code: value, name: value };
  const selectedOption = selectedIndex >= 0 ? currencyOptions[selectedIndex] : fallbackOption;
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredOptions = useMemo(
    () => currencyOptions.filter((option) => matchesQuery(option, query)),
    [currencyOptions, query]
  );

  useEffect(() => {
    if (!isOpen || searchable) {
      return;
    }

    queueFocus(() => {
      optionRefs.current[activeIndex]?.focus();
    });
  }, [activeIndex, isOpen, searchable]);

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

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!searchable) {
      return;
    }

    queueFocus(() => {
      searchInputRef.current?.focus();
    });
  }, [isOpen, searchable]);

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

    setQuery("");
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setIsOpen(true);
  }

  function handleSelect(code: string): void {
    onChange(code);
    closePicker();
  }

  function moveActiveIndex(step: number): void {
    const nextIndex = clampCurrencyIndex(activeIndex + step, filteredOptions.length);
    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
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

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>): void {
    setQuery(event.target.value);
    setActiveIndex(0);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActiveIndex(0);
        break;
      case "Escape":
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
        optionRefs.current[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(filteredOptions.length - 1);
        optionRefs.current[filteredOptions.length - 1]?.focus();
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
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled || currencyOptions.length === 0}
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`Currency: ${selectedOption.name} ${selectedOption.code}`}
        className="flex h-9 shrink-0 items-center gap-1 border-r px-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
        style={{ borderColor: "var(--input)", color: "var(--fg)" }}
        onClick={() => {
          if (isOpen) {
            closePicker();
            return;
          }

          openPicker();
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{getCurrencySymbol(selectedOption.code)}</span>
        <ChevronDown className="size-3.5" strokeWidth={1.5} style={{ color: "var(--fg-3)" }} />
      </button>

      {isOpen ? (
        <div
          className="absolute left-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-xl"
          style={{
            border: "1px solid var(--line)",
            background: "var(--surface)",
            boxShadow: "0 18px 36px color-mix(in srgb, var(--fg) 12%, transparent)",
          }}
        >
          {searchable ? (
            <div className="border-b p-2" style={{ borderColor: "var(--line)" }}>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2"
                  strokeWidth={1.5}
                  style={{ color: "var(--fg-3)" }}
                />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search"
                  aria-label="Search currencies"
                  value={query}
                  onChange={handleSearchChange}
                  onKeyDown={handleSearchKeyDown}
                  className="pl-8"
                />
              </div>
            </div>
          ) : null}

          <ScrollArea className="h-80">
            <div id={listboxId} role="listbox" aria-label="Currency options" className="p-2">
              {filteredOptions.length === 0 ? (
                <p className="px-2 py-4 text-center text-sm" style={{ color: "var(--fg-3)" }}>
                  No currencies found
                </p>
              ) : (
                filteredOptions.map((option, index) => {
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
                        className="inline-flex h-8 min-w-10 items-center justify-center rounded-md border px-2 text-xs font-semibold"
                        style={{
                          borderColor: isSelected ? "var(--accent-brand)" : "var(--line)",
                          background: isSelected ? "var(--surface)" : "var(--surface-2)",
                          color: "inherit",
                          fontFamily: "var(--font-body, ui-sans-serif)",
                        }}
                      >
                        {option.code.slice(0, 2)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{option.name}</span>
                        <span
                          className="truncate text-xs uppercase tracking-[0.08em]"
                          style={{ color: isSelected ? "inherit" : "var(--fg-3)" }}
                        >
                          {option.code}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>
      ) : null}
    </div>
  );
}
