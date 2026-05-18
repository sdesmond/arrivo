"use client";

import { useState, useTransition } from "react";
import { Section, Field } from "@/components/packt/form-section";
import { Button } from "@/components/ui/button";
import { updateProfile } from "./actions";
import type { UserProfile } from "@/data/types";

const DATE_FORMAT_OPTIONS = [
  { value: "MM/DD/YYYY", label: "Month/Day" },
  { value: "DD/MM/YYYY", label: "Day/Month" },
] as const;

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
      <Field label="Date format">
        <div className="flex rounded-[6px] overflow-hidden" style={{ border: "1px solid var(--line)" }}>
          {DATE_FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleDateFormatChange(opt.value)}
              className="flex-1 px-3 py-1.5 font-medium transition-colors"
              style={{
                background: dateFormat === opt.value ? "var(--accent-brand)" : "var(--surface-2)",
                color: dateFormat === opt.value ? "var(--accent-fg)" : "var(--fg-2)",
                fontSize: "calc(13px * var(--font-scale))",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Currency" htmlFor="pref-currency">
        <input
          id="pref-currency"
          type="text"
          value={currency}
          onChange={(e) => handleCurrencyChange(e.target.value.toUpperCase().slice(0, 3))}
          className="w-full rounded-[6px] px-2.5 py-1.5 outline-none transition-colors"
          style={{
            background: "var(--surface-2)",
            color: "var(--fg)",
            border: "1px solid var(--line)",
            fontSize: "calc(13px * var(--font-scale))",
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
              className="flex-1 px-3 py-1.5 font-medium transition-colors capitalize"
              style={{
                background: distanceUnit === unit ? "var(--accent-brand)" : "var(--surface-2)",
                color: distanceUnit === unit ? "var(--accent-fg)" : "var(--fg-2)",
                fontSize: "calc(13px * var(--font-scale))",
              }}
            >
              {unit}
            </button>
          ))}
        </div>
      </Field>

      <div className="flex items-center justify-end gap-3">
        {justSaved && (
          <span role="status" style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--accent-brand)" }}>
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
