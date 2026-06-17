"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

export interface TimePickerProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}

export function TimePicker({
  value,
  onChange,
  disabled,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: TimePickerProps) {
  return (
    <Input
      type="time"
      value={value ?? ""}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid}
      className="w-auto appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
      onChange={(event) => onChange(event.target.value || undefined)}
    />
  );
}
