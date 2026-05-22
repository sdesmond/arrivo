"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
    <Select value={mounted ? (theme ?? "system") : "system"} onValueChange={(v) => setTheme(v ?? "system")}>
      <SelectTrigger aria-label="Theme" disabled={!mounted} className="w-full">
        <SelectValue className="capitalize" />
      </SelectTrigger>
      <SelectContent>
        {THEME_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
