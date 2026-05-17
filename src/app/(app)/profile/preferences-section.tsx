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
}

export function ProfilePreferencesSection({ user }: ProfilePreferencesSectionProps) {
  const [dateFormat, setDateFormat] = useState(user.dateFormat ?? "MM/DD/YYYY");
  const [currency, setCurrency] = useState(user.currency ?? "");
  const [distanceUnit, setDistanceUnit] = useState(user.distanceUnit ?? "imperial");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await updateProfile({ dateFormat, currency, distanceUnit });
    });
  }

  return (
    <Section title="Preferences">
      <Field label="Date format" htmlFor="pref-date-format">
        <select
          id="pref-date-format"
          value={dateFormat}
          onChange={(e) => setDateFormat(e.target.value)}
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
          onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
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
              onClick={() => setDistanceUnit(unit)}
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

      <div>
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Section>
  );
}
