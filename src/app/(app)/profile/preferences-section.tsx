"use client";

import { useState, useTransition } from "react";
import { CurrencyPicker } from "@/components/packt/currency-picker";
import { Section, Field } from "@/components/packt/form-section";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listSupportedCurrencies } from "@/lib/currencies";
import { toast } from "sonner";
import { updateProfile } from "./actions";
import { Car, Footprints, TrainFront } from "lucide-react";
import { CoverType, TransitMode } from "@/data/types";
import type { TransitMode as TransitModeValue, UserProfile } from "@/data/types";

const THRESHOLD_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const METERS_PER_FOOT = 0.3048;
const IMPERIAL_WALK_THRESHOLDS = [200, 400, 800, 1600].map((feet) => ({
  label: `${feet} ft`,
  meters: Math.round(feet * METERS_PER_FOOT),
}));
const METRIC_WALK_THRESHOLDS = [100, 200, 500, 1000].map((meters) => ({
  label: `${meters} m`,
  meters,
}));

const TRANSIT_MODE_OPTIONS = [
  { value: TransitMode.Walk, label: "Walk", Icon: Footprints },
  { value: TransitMode.Drive, label: "Drive", Icon: Car },
  { value: TransitMode.Transit, label: "Transit", Icon: TrainFront },
] as const;

const DATE_FORMAT_OPTIONS = [
  { value: "MM/DD/YYYY", label: "Month/Day" },
  { value: "DD/MM/YYYY", label: "Day/Month" },
] as const;

const COVER_TYPE_OPTIONS = [
  { value: CoverType.Photo, label: "Photo" },
  { value: CoverType.Map, label: "Map" },
  { value: CoverType.Graphic, label: "Graphic" },
] as const;
const CURRENCY_OPTIONS = listSupportedCurrencies();

interface ProfilePreferencesSectionProps {
  user: UserProfile;
  onDirtyChange?: (dirty: boolean) => void;
}

export function ProfilePreferencesSection({ user, onDirtyChange }: ProfilePreferencesSectionProps) {
  const [dateFormat, setDateFormat] = useState(user.dateFormat ?? "MM/DD/YYYY");
  const [currency, setCurrency] = useState(user.currency ?? "USD");
  const [distanceUnit, setDistanceUnit] = useState(user.distanceUnit ?? "imperial");
  const [transitMode, setTransitMode] = useState<TransitModeValue>(user.transitMode ?? TransitMode.Drive);
  const [walkThresholdMeters, setWalkThresholdMeters] = useState<number | null>(user.walkThresholdMeters ?? null);
  const [coverType, setCoverType] = useState<string>(user.defaultCoverType ?? CoverType.Photo);
  const [warningThreshold, setWarningThreshold] = useState(user.warningThreshold ?? 80);
  const [dangerThreshold, setDangerThreshold] = useState(user.dangerThreshold ?? 90);
  const [isPending, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);

  function computeDirty(
    dateFormat: string,
    currency: string,
    distanceUnit: string,
    transitMode: TransitModeValue,
    walkThresholdMeters: number | null,
    coverType: string,
    warningThreshold: number,
    dangerThreshold: number
  ) {
    return (
      dateFormat !== (user.dateFormat ?? "MM/DD/YYYY") ||
      currency !== (user.currency ?? "USD") ||
      distanceUnit !== (user.distanceUnit ?? "imperial") ||
      transitMode !== (user.transitMode ?? TransitMode.Drive) ||
      walkThresholdMeters !== (user.walkThresholdMeters ?? null) ||
      coverType !== (user.defaultCoverType ?? CoverType.Photo) ||
      warningThreshold !== (user.warningThreshold ?? 80) ||
      dangerThreshold !== (user.dangerThreshold ?? 90)
    );
  }

  function handleDateFormatChange(next: string) {
    if (next === dateFormat) return;
    setDateFormat(next);
    onDirtyChange?.(
      computeDirty(
        next,
        currency,
        distanceUnit,
        transitMode,
        walkThresholdMeters,
        coverType,
        warningThreshold,
        dangerThreshold
      )
    );
  }

  function handleCurrencyChange(next: string) {
    if (next === currency) return;
    setCurrency(next);
    onDirtyChange?.(
      computeDirty(
        dateFormat,
        next,
        distanceUnit,
        transitMode,
        walkThresholdMeters,
        coverType,
        warningThreshold,
        dangerThreshold
      )
    );
  }

  function handleDistanceUnitChange(next: string) {
    if (next === distanceUnit) return;
    setDistanceUnit(next);
    onDirtyChange?.(
      computeDirty(
        dateFormat,
        currency,
        next,
        transitMode,
        walkThresholdMeters,
        coverType,
        warningThreshold,
        dangerThreshold
      )
    );
  }

  function handleTransitModeChange(next: string) {
    if (!Object.values(TransitMode).includes(next as TransitModeValue) || next === transitMode) return;
    const nextMode = next as TransitModeValue;
    setTransitMode(nextMode);
    onDirtyChange?.(
      computeDirty(
        dateFormat,
        currency,
        distanceUnit,
        nextMode,
        walkThresholdMeters,
        coverType,
        warningThreshold,
        dangerThreshold
      )
    );
  }

  function handleWalkThresholdChange(next: string) {
    const nextThreshold = next === "off" ? null : Number(next);
    if (nextThreshold === walkThresholdMeters) return;
    setWalkThresholdMeters(nextThreshold);
    onDirtyChange?.(
      computeDirty(
        dateFormat,
        currency,
        distanceUnit,
        transitMode,
        nextThreshold,
        coverType,
        warningThreshold,
        dangerThreshold
      )
    );
  }

  function handleCoverTypeChange(next: string) {
    if (next === coverType) return;
    setCoverType(next);
    onDirtyChange?.(
      computeDirty(
        dateFormat,
        currency,
        distanceUnit,
        transitMode,
        walkThresholdMeters,
        next,
        warningThreshold,
        dangerThreshold
      )
    );
  }

  function handleWarningThresholdChange(next: number) {
    if (next === warningThreshold) return;
    const nextDanger = dangerThreshold <= next ? Math.min(next + 10, 100) : dangerThreshold;
    setWarningThreshold(next);
    setDangerThreshold(nextDanger);
    onDirtyChange?.(
      computeDirty(dateFormat, currency, distanceUnit, transitMode, walkThresholdMeters, coverType, next, nextDanger)
    );
  }

  function handleDangerThresholdChange(next: number) {
    if (next === dangerThreshold) return;
    setDangerThreshold(next);
    onDirtyChange?.(
      computeDirty(
        dateFormat,
        currency,
        distanceUnit,
        transitMode,
        walkThresholdMeters,
        coverType,
        warningThreshold,
        next
      )
    );
  }

  function handleSave() {
    startTransition(async () => {
      const patch: Parameters<typeof updateProfile>[0] = {};
      if (dateFormat !== (user.dateFormat ?? "MM/DD/YYYY")) patch.dateFormat = dateFormat;
      if (currency !== (user.currency ?? "USD")) patch.currency = currency;
      if (distanceUnit !== (user.distanceUnit ?? "imperial")) patch.distanceUnit = distanceUnit;
      if (transitMode !== (user.transitMode ?? TransitMode.Drive)) patch.transitMode = transitMode;
      if (walkThresholdMeters !== (user.walkThresholdMeters ?? null)) patch.walkThresholdMeters = walkThresholdMeters;
      if (coverType !== (user.defaultCoverType ?? CoverType.Photo)) patch.defaultCoverType = coverType as CoverType;
      if (warningThreshold !== (user.warningThreshold ?? 80) || dangerThreshold !== (user.dangerThreshold ?? 90)) {
        patch.warningThreshold = warningThreshold;
        patch.dangerThreshold = dangerThreshold;
      }
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

  const walkThresholdOptions = distanceUnit === "imperial" ? IMPERIAL_WALK_THRESHOLDS : METRIC_WALK_THRESHOLDS;
  const selectedWalkThreshold = walkThresholdOptions.find((option) => option.meters === walkThresholdMeters);
  const displayedWalkThreshold =
    walkThresholdMeters !== null && !selectedWalkThreshold
      ? {
          label:
            distanceUnit === "imperial"
              ? `${Math.round(walkThresholdMeters / METERS_PER_FOOT)} ft`
              : `${walkThresholdMeters} m`,
          meters: walkThresholdMeters,
        }
      : null;
  const walkThresholdLabel = selectedWalkThreshold?.label ?? displayedWalkThreshold?.label;
  const isDirty = computeDirty(
    dateFormat,
    currency,
    distanceUnit,
    transitMode,
    walkThresholdMeters,
    coverType,
    warningThreshold,
    dangerThreshold
  );

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

      <Field label="Currency">
        <CurrencyPicker currencyOptions={CURRENCY_OPTIONS} value={currency} onChange={handleCurrencyChange} />
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

      <Section title="Budget">
        <div className="flex gap-3">
          <Field label="Warning %" htmlFor="pref-warning">
            <Select
              value={String(warningThreshold)}
              onValueChange={(selectedValue) => handleWarningThresholdChange(Number(selectedValue))}
            >
              <SelectTrigger id="pref-warning" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THRESHOLD_OPTIONS.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Danger %" htmlFor="pref-danger">
            <Select
              value={String(dangerThreshold)}
              onValueChange={(selectedValue) => handleDangerThresholdChange(Number(selectedValue))}
            >
              <SelectTrigger id="pref-danger" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THRESHOLD_OPTIONS.map((value) => (
                  <SelectItem key={value} value={String(value)} disabled={value <= warningThreshold}>
                    {value}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </Section>

      <Section title="Getting Around">
        <Field label="Default transit mode">
          <ToggleGroup
            aria-label="Default transit mode"
            value={[transitMode]}
            onValueChange={(values) => handleTransitModeChange(values[0] ?? "")}
          >
            {TRANSIT_MODE_OPTIONS.map(({ value, label, Icon }) => (
              <ToggleGroupItem key={value} value={value} className="h-11 px-3.5">
                <Icon strokeWidth={1.5} />
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>

        <Field label="Walk if closer than" htmlFor="pref-walk-threshold">
          <Select
            value={walkThresholdMeters === null ? "off" : String(walkThresholdMeters)}
            onValueChange={(value) => handleWalkThresholdChange(value ?? "off")}
          >
            <SelectTrigger id="pref-walk-threshold" className="h-11 w-full">
              <SelectValue>{walkThresholdMeters === null ? "Off" : walkThresholdLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">Off</SelectItem>
              {displayedWalkThreshold && (
                <SelectItem value={String(displayedWalkThreshold.meters)}>{displayedWalkThreshold.label}</SelectItem>
              )}
              {walkThresholdOptions.map((option) => (
                <SelectItem key={option.meters} value={String(option.meters)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>

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
