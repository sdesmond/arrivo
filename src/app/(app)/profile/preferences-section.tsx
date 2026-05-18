"use client";

import { useState, useTransition } from "react";
import { Section, Field } from "@/components/packt/form-section";
import { Button } from "@/components/ui/button";
import { updateProfile } from "./actions";
import type { UserProfile } from "@/data/types";

const DATE_FORMAT_OPTIONS = [
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (US)" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (International)" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (ISO)" },
];

interface ProfilePreferencesSectionProps {
  user: UserProfile;
  onDirtyChange?: (dirty: boolean) => void;
}

export function ProfilePreferencesSection({ user, onDirtyChange }: ProfilePreferencesSectionProps) {
  const [dateFormat, setDateFormat] = useState(user.dateFormat ?? "MM/DD/YYYY");
  const [currency, setCurrency] = useState(user.currency ?? "");
  const [distanceUnit, setDistanceUnit] = useState(user.distanceUnit ?? "imperial");
  const [isPending, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);

  function computeDirty(df: string, cur: string, du: string) {
    return (
      df !== (user.dateFormat ?? "MM/DD/YYYY") ||
      cur !== (user.currency ?? "") ||
      du !== (user.distanceUnit ?? "imperial")
    );
  }

  function handleDateFormatChange(next: string) {
    setDateFormat(next);
    onDirtyChange?.(computeDirty(next, currency, distanceUnit));
  }

  function handleCurrencyChange(next: string) {
    setCurrency(next);
    onDirtyChange?.(computeDirty(dateFormat, next, distanceUnit));
  }

  function handleDistanceUnitChange(next: string) {
    setDistanceUnit(next);
    onDirtyChange?.(computeDirty(dateFormat, currency, next));
  }

  function handleSave() {
    startTransition(async () => {
      await updateProfile({ dateFormat, currency, distanceUnit });
      setJustSaved(true);
      onDirtyChange?.(false);
      setTimeout(() => setJustSaved(false), 2000);
    });
  }

  const isDirty = computeDirty(dateFormat, currency, distanceUnit);

  return (
    <Section>
      <Field label="Date format" htmlFor="pref-date-format">
        <select
          id="pref-date-format"
          value={dateFormat}
          onChange={(e) => handleDateFormatChange(e.target.value)}
          className="w-full rounded-[6px] px-2.5 py-1.5 text-[13px] outline-none transition-colors"
          style={{
            background: "var(--surface-2)",
            color: "var(--fg)",
            border: "1px solid var(--line)",
          }}
        >
          {DATE_FORMAT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Currency" htmlFor="pref-currency">
        <input
          id="pref-currency"
          type="text"
          value={currency}
          onChange={(e) => handleCurrencyChange(e.target.value.toUpperCase().slice(0, 3))}
          className="w-full rounded-[6px] px-2.5 py-1.5 text-[13px] outline-none transition-colors"
          style={{
            background: "var(--surface-2)",
            color: "var(--fg)",
            border: "1px solid var(--line)",
          }}
          placeholder="USD"
          maxLength={3}
        />
      </Field>

      <Field label="Distance units">
        <div className="flex rounded-[6px] overflow-hidden" style={{ border: "1px solid var(--line)" }}>
          {(["imperial", "metric"] as const).map((unit) => (
            <button
              key={unit}
              type="button"
              onClick={() => handleDistanceUnitChange(unit)}
              className="flex-1 px-3 py-1.5 text-[13px] font-medium transition-colors capitalize"
              style={{
                background: distanceUnit === unit ? "var(--accent-brand)" : "var(--surface-2)",
                color: distanceUnit === unit ? "var(--accent-fg)" : "var(--fg-2)",
              }}
            >
              {unit}
            </button>
          ))}
        </div>
      </Field>

      <div className="flex items-center justify-end gap-3">
        {justSaved && (
          <span role="status" style={{ fontSize: "12px", color: "var(--accent-brand)" }}>
            Saved
          </span>
        )}
        <Button size="sm" onClick={handleSave} disabled={isPending || !isDirty}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Section>
  );
}
