"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface TimePickerProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
}

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
const PERIODS = ["AM", "PM"] as const;
type Period = (typeof PERIODS)[number];

function parseTime(hhmm: string): { hour: string; minute: string; period: Period } | null {
  const match = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const min = match[2];
  if (h < 0 || h > 23) return null;
  const period: Period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { hour: String(hour12), minute: min, period };
}

function buildHHMM(hour: string, minute: string, period: Period): string {
  let h = parseInt(hour, 10);
  if (period === "AM" && h === 12) h = 0;
  if (period === "PM" && h !== 12) h += 12;
  return `${String(h).padStart(2, "0")}:${minute}`;
}

export function TimePicker({ value, onChange, disabled }: TimePickerProps) {
  const parsed = value ? parseTime(value) : null;
  const [hour, setHour] = React.useState(parsed?.hour ?? "");
  const [minute, setMinute] = React.useState(parsed?.minute ?? "");
  const [period, setPeriod] = React.useState(parsed?.period ?? "");
  const [prevValue, setPrevValue] = React.useState(value);

  if (prevValue !== value) {
    setPrevValue(value);
    const p = value ? parseTime(value) : null;
    setHour(p?.hour ?? "");
    setMinute(p?.minute ?? "");
    setPeriod(p?.period ?? "");
  }

  function emit(h: string, m: string, p: string) {
    if (!h || !m || !p) {
      onChange(undefined);
    } else {
      onChange(buildHHMM(h, m, p as Period));
    }
  }

  return (
    <div className={cn("flex items-center gap-1.5")}>
      <Select
        value={hour || undefined}
        onValueChange={(v) => {
          if (v === null) return;
          setHour(v);
          emit(v, minute, period);
        }}
        disabled={disabled}
      >
        <SelectTrigger aria-label="Hour" className="w-16">
          <SelectValue placeholder="HH" />
        </SelectTrigger>
        <SelectContent>
          {HOURS.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-sm select-none" style={{ color: "var(--fg-3)" }}>
        :
      </span>
      <Select
        value={minute || undefined}
        onValueChange={(v) => {
          if (v === null) return;
          setMinute(v);
          emit(hour, v, period);
        }}
        disabled={disabled}
      >
        <SelectTrigger aria-label="Minute" className="w-16">
          <SelectValue placeholder="MM" />
        </SelectTrigger>
        <SelectContent>
          {MINUTES.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={period || undefined}
        onValueChange={(v) => {
          if (v === null) return;
          setPeriod(v);
          emit(hour, minute, v);
        }}
        disabled={disabled}
      >
        <SelectTrigger aria-label="AM/PM" className="w-20">
          <SelectValue placeholder="AM/PM" />
        </SelectTrigger>
        <SelectContent>
          {PERIODS.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Clear time"
          disabled={disabled}
          onClick={() => onChange(undefined)}
          style={{ color: "var(--fg-3)" }}
        >
          <X size={14} strokeWidth={1.5} />
        </Button>
      )}
    </div>
  );
}
