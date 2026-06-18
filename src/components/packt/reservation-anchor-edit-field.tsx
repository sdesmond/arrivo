"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { formatAnchorDateTime } from "@/components/packt/reservation-type-badge";

export interface ReservationAnchorEditFieldProps {
  label: string;
  value: string | undefined;
  displayStyle?: React.CSSProperties;
  placeholderStyle?: React.CSSProperties;
  onSave: (iso: string) => Promise<void>;
}

export function ReservationAnchorEditField({
  label,
  value,
  displayStyle,
  placeholderStyle,
  onSave,
}: ReservationAnchorEditFieldProps) {
  const [editing, setEditing] = useState(false);
  const [dateDraft, setDateDraft] = useState<string | undefined>(undefined);
  const [timeDraft, setTimeDraft] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const displayRef = useRef<HTMLButtonElement | null>(null);
  const wasEditingRef = useRef(false);

  useEffect(() => {
    if (wasEditingRef.current && !editing) {
      displayRef.current?.focus();
    }
    wasEditingRef.current = editing;
  }, [editing]);

  function openEdit() {
    if (value) {
      setDateDraft(value.slice(0, 10));
      setTimeDraft(value.slice(11, 16));
    } else {
      setDateDraft(undefined);
      setTimeDraft(undefined);
    }
    setError(undefined);
    setEditing(true);
  }

  async function save() {
    const hasDate = !!dateDraft;
    const hasTime = !!timeDraft;
    if (hasDate !== hasTime) {
      setError("Enter both a date and a time.");
      return;
    }
    const nextIso = hasDate ? `${dateDraft}T${timeDraft}:00.000Z` : "";
    try {
      await onSave(nextIso);
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save reservation.");
    }
  }

  function cancel() {
    setEditing(false);
  }

  if (editing) {
    return (
      <div
        className="flex flex-col gap-1"
        onKeyDownCapture={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void save();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
      >
        <div className="flex items-center gap-2">
          <DatePicker value={dateDraft} onChange={setDateDraft} aria-label={`${label} date`} aria-invalid={!!error} />
          <TimePicker value={timeDraft} onChange={setTimeDraft} aria-label={`${label} time`} aria-invalid={!!error} />
          <button
            type="button"
            title="Save"
            aria-label={`Save ${label}`}
            onClick={() => void save()}
            className="inline-flex items-center justify-center size-8 rounded"
            style={{ border: "none", background: "transparent", color: "var(--accent-brand)", cursor: "pointer" }}
          >
            <Check size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <button
            type="button"
            title="Cancel"
            aria-label={`Cancel editing ${label}`}
            onClick={cancel}
            className="inline-flex items-center justify-center size-8 rounded"
            style={{ border: "none", background: "transparent", color: "var(--fg-3)", cursor: "pointer" }}
          >
            <X size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
        {error && (
          <p role="status" aria-live="polite" style={{ fontSize: 11, color: "var(--destructive)" }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  if (value) {
    return (
      <button
        type="button"
        ref={displayRef}
        onClick={openEdit}
        style={displayStyle}
        aria-label={`${label}: ${formatAnchorDateTime(value)}`}
      >
        {formatAnchorDateTime(value)}
      </button>
    );
  }

  return (
    <button
      type="button"
      ref={displayRef}
      onClick={openEdit}
      style={placeholderStyle}
      aria-label={`Add ${label.toLowerCase()}`}
    >
      {`Add ${label.toLowerCase()}`}
    </button>
  );
}
