"use client";

import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";

export interface ReservationAnchorFieldsetProps {
  legend: string;
  required: boolean;
  date?: string;
  time?: string;
  onDateChange: (value: string | undefined) => void;
  onTimeChange: (value: string | undefined) => void;
  error?: string;
}

export function ReservationAnchorFieldset({
  legend,
  required,
  date,
  time,
  onDateChange,
  onTimeChange,
  error,
}: ReservationAnchorFieldsetProps) {
  const errorId = error ? `${legend}-error`.toLowerCase().replace(/\s+/g, "-") : undefined;
  const invalid = !!error;

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend
        style={{
          fontFamily: "var(--font-mono-family, ui-monospace)",
          fontSize: "calc(9px * var(--font-scale))",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--fg-4)",
          marginBottom: 4,
        }}
      >
        {legend}
        {required ? <span style={{ color: "var(--accent-brand)" }}> *</span> : " (Optional)"}
      </legend>
      <div className="flex items-center gap-2">
        <DatePicker
          value={date}
          onChange={onDateChange}
          aria-label={`${legend} date`}
          aria-invalid={invalid}
          aria-describedby={error ? errorId : undefined}
        />
        <TimePicker
          value={time}
          onChange={onTimeChange}
          aria-label={`${legend} time`}
          aria-invalid={invalid}
          aria-describedby={error ? errorId : undefined}
        />
      </div>
      {error && errorId && (
        <p
          id={errorId}
          role="status"
          aria-live="polite"
          style={{ fontSize: "calc(11px * var(--font-scale))", color: "var(--destructive)", marginTop: 4 }}
        >
          {error}
        </p>
      )}
    </fieldset>
  );
}
