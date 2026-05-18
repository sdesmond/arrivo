"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import type { FontSizeValue } from "@/data/types";

const SIZES: { value: FontSizeValue; label: string; px: string }[] = [
  { value: "small", label: "Small", px: "13px" },
  { value: "medium", label: "Medium", px: "15px" },
  { value: "large", label: "Large", px: "17px" },
];

const STORAGE_KEY = "packt-font-size";
const DEFAULT: FontSizeValue = "medium";

function applyFontSize(value: FontSizeValue) {
  const size = SIZES.find((s) => s.value === value) ?? SIZES[1];
  document.documentElement.style.setProperty("--font-size-base", size.px);
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

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as FontSizeValue;
    setValue(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable
    }
    applyFontSize(next);
  }

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={!mounted}
      aria-label="Font size"
      className="rounded-[6px] px-2.5 py-1.5 text-[13px] outline-none transition-colors"
      style={{
        background: "var(--surface-2)",
        color: "var(--fg)",
        border: "1px solid var(--line)",
        minWidth: 120,
      }}
    >
      {SIZES.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
