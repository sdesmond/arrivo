"use client";

import { useState, useTransition } from "react";
import { Section, Field } from "@/components/packt/form-section";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { updateProfile } from "./actions";
import { CoverType } from "@/data/types";
import type { UserProfile } from "@/data/types";

const DATE_FORMAT_OPTIONS = [
  { value: "MM/DD/YYYY", label: "Month/Day" },
  { value: "DD/MM/YYYY", label: "Day/Month" },
] as const;

const COVER_TYPE_OPTIONS = [
  { value: CoverType.Photo, label: "Photo" },
  { value: CoverType.Map, label: "Map" },
  { value: CoverType.Graphic, label: "Graphic" },
] as const;

interface ProfilePreferencesSectionProps {
  user: UserProfile;
  onDirtyChange?: (dirty: boolean) => void;
}

export function ProfilePreferencesSection({ user, onDirtyChange }: ProfilePreferencesSectionProps) {
  const [dateFormat, setDateFormat] = useState(user.dateFormat ?? "MM/DD/YYYY");
  const [currency, setCurrency] = useState(user.currency ?? "");
  const [distanceUnit, setDistanceUnit] = useState(user.distanceUnit ?? "imperial");
  const [coverType, setCoverType] = useState<string>(user.defaultCoverType ?? CoverType.Photo);
  const [isPending, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);

  function computeDirty(dateFormat: string, currency: string, distanceUnit: string, coverType: string) {
    return (
      dateFormat !== (user.dateFormat ?? "MM/DD/YYYY") ||
      currency !== (user.currency ?? "") ||
      distanceUnit !== (user.distanceUnit ?? "imperial") ||
      coverType !== (user.defaultCoverType ?? CoverType.Photo)
    );
  }

  function handleDateFormatChange(next: string) {
    setDateFormat(next);
    onDirtyChange?.(computeDirty(next, currency, distanceUnit, coverType));
  }

  function handleCurrencyChange(next: string) {
    setCurrency(next);
    onDirtyChange?.(computeDirty(dateFormat, next, distanceUnit, coverType));
  }

  function handleDistanceUnitChange(next: string) {
    setDistanceUnit(next);
    onDirtyChange?.(computeDirty(dateFormat, currency, next, coverType));
  }

  function handleCoverTypeChange(next: string) {
    setCoverType(next);
    onDirtyChange?.(computeDirty(dateFormat, currency, distanceUnit, next));
  }

  const currencyError =
    currency.length > 0 && !/^[A-Z]{3}$/.test(currency) ? "Currency must be a 3-letter ISO code (e.g. USD)." : null;

  function handleSave() {
    startTransition(async () => {
      const patch: Parameters<typeof updateProfile>[0] = {};
      if (dateFormat !== (user.dateFormat ?? "MM/DD/YYYY")) patch.dateFormat = dateFormat;
      if (currency !== (user.currency ?? "")) patch.currency = currency;
      if (distanceUnit !== (user.distanceUnit ?? "imperial")) patch.distanceUnit = distanceUnit;
      if (coverType !== (user.defaultCoverType ?? CoverType.Photo)) patch.defaultCoverType = coverType as CoverType;
      const result = await updateProfile(patch);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setJustSaved(true);
      onDirtyChange?.(false);
      setTimeout(() => setJustSaved(false), 2000);
    });
  }

  const isDirty = computeDirty(dateFormat, currency, distanceUnit, coverType);

  return (
    <Section>
      <Field label="Date format">
        <ToggleGroup
          aria-label="Date format"
          value={[dateFormat]}
          onValueChange={(arr) => handleDateFormatChange(arr[0] ?? dateFormat)}
        >
          {DATE_FORMAT_OPTIONS.map((opt) => (
            <ToggleGroupItem key={opt.value} value={opt.value}>
              {opt.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>

      <Field label="Currency" htmlFor="pref-currency" error={currencyError ?? undefined}>
        <Input
          id="pref-currency"
          type="text"
          value={currency}
          onChange={(event) => handleCurrencyChange(event.target.value.toUpperCase().slice(0, 3))}
          placeholder="USD"
          maxLength={3}
          aria-invalid={!!currencyError || undefined}
          aria-describedby={currencyError ? "pref-currency-error" : undefined}
        />
      </Field>

      <Field label="Distance units">
        <ToggleGroup
          aria-label="Distance units"
          value={[distanceUnit]}
          onValueChange={(arr) => handleDistanceUnitChange(arr[0] ?? distanceUnit)}
        >
          {(["imperial", "metric"] as const).map((unit) => (
            <ToggleGroupItem key={unit} value={unit} className="capitalize">
              {unit}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>

      <Field label="Default trip cover type">
        <ToggleGroup
          aria-label="Default trip cover type"
          value={[coverType]}
          onValueChange={(arr) => handleCoverTypeChange(arr[0] ?? coverType)}
        >
          {COVER_TYPE_OPTIONS.map((opt) => (
            <ToggleGroupItem key={opt.value} value={opt.value}>
              {opt.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>

      <div className="flex items-center justify-end gap-3">
        {justSaved && (
          <span role="status" style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--accent-brand)" }}>
            Saved
          </span>
        )}
        <Button size="sm" onClick={handleSave} disabled={isPending || !isDirty || !!currencyError}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Section>
  );
}
