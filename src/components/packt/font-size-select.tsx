"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import type { FontSizeValue } from "@/data/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SIZES: { value: FontSizeValue; label: string; px: string }[] = [
  { value: "small", label: "Small", px: "13px" },
  { value: "medium", label: "Medium", px: "16px" },
  { value: "large", label: "Large", px: "18px" },
];

const STORAGE_KEY = "packt-font-size";
const DEFAULT: FontSizeValue = "medium";

function applyFontSize(value: FontSizeValue) {
  const size = SIZES.find((sizeOption) => sizeOption.value === value) ?? SIZES[1];
  document.documentElement.style.setProperty("--font-size-base", size.px);
  document.documentElement.dataset.fontSize = value;
}

function readStorage(): FontSizeValue {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "small" || stored === "medium" || stored === "large") return stored;
  } catch {
    // localStorage unavailable
  }
  return DEFAULT;
}

export function FontSizeSelect() {
  // Lazy initializer reads localStorage on the client; returns DEFAULT during SSR
  const [value, setValue] = useState<FontSizeValue>(() => {
    if (typeof window === "undefined") return DEFAULT;
    return readStorage();
  });

  // Hydration guard — same pattern as ThemeSelect
  const mounted = useSyncExternalStore(
    /* istanbul ignore next */
    () => /* istanbul ignore next */ () => {},
    () => true,
    () => false
  );

  // Apply the stored preference to the DOM once after hydration
  useEffect(() => {
    applyFontSize(readStorage());
  }, []);

  function handleChange(next: FontSizeValue) {
    setValue(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable
    }
    applyFontSize(next);
  }

  return (
    <Select value={value} onValueChange={(selectedValue) => handleChange(selectedValue as FontSizeValue)}>
      <SelectTrigger aria-label="Font size" disabled={!mounted} className="w-full">
        <SelectValue className="capitalize" />
      </SelectTrigger>
      <SelectContent>
        {SIZES.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
