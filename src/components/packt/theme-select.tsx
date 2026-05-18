"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

const THEME_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

export function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    /* istanbul ignore next */
    () => /* istanbul ignore next */ () => {},
    () => true,
    () => false
  );

  return (
    <select
      value={mounted ? (theme ?? "system") : "system"}
      onChange={(e) => setTheme(e.target.value)}
      disabled={!mounted}
      aria-label="Theme"
      className="rounded-[6px] px-2.5 py-1.5 outline-none transition-colors"
      style={{
        background: "var(--surface-2)",
        color: "var(--fg)",
        border: "1px solid var(--line)",
        minWidth: 120,
        fontSize: "calc(13px * var(--font-scale))",
      }}
    >
      {THEME_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
