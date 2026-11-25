"use client";

import { useState, useRef, useEffect } from "react";
import { ANCHOR_LABELS, formatReservationDateRange } from "@/components/arrivo/reservation-type-badge";
import { PLACEHOLDER_STYLE } from "@/components/arrivo/reservation-inline-text-field";
import { useReservationPatch, type ReservationPatchBody } from "@/components/arrivo/use-reservation-patch";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import type { ReservationType } from "@/data/types";
import { combineDateAndTimeToIso } from "@/lib/utils";

export interface ReservationDateEditorProps {
  reservationId: string;
  type: ReservationType;
  startAt?: string;
  endAt?: string;
  onSaved: (dates: { startAt?: string; endAt?: string }) => void;
}

const FIELD_LABEL_STYLE: React.CSSProperties = { color: "var(--fg-3)", minWidth: 68, fontSize: 13 };
const FIELD_VALUE_STYLE: React.CSSProperties = { color: "var(--fg-2)", fontSize: 13 };

function isoToParts(iso: string): { date: string; time: string } {
  const date = new Date(iso);
  return {
    date: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`,
    time: `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`,
  };
}

export function ReservationDateEditor({ reservationId, type, startAt, endAt, onSaved }: ReservationDateEditorProps) {
  const patchReservation = useReservationPatch();
  const [editingDates, setEditingDates] = useState(false);
  const [startDateDraft, setStartDateDraft] = useState<string | undefined>(undefined);
  const [startTimeDraft, setStartTimeDraft] = useState<string | undefined>(undefined);
  const [endDateDraft, setEndDateDraft] = useState<string | undefined>(undefined);
  const [endTimeDraft, setEndTimeDraft] = useState<string | undefined>(undefined);
  const [dateError, setDateError] = useState<string | undefined>(undefined);
  const savingDatesRef = useRef(false);
  const isCalendarOpenRef = useRef(false);
  const dateEditRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editingDates) {
      dateEditRef.current?.focus();
    }
  }, [editingDates]);

  function handleOpenDateEdit() {
    if (startAt) {
      const { date, time } = isoToParts(startAt);
      setStartDateDraft(date);
      setStartTimeDraft(time);
    } else {
      setStartDateDraft(undefined);
      setStartTimeDraft(undefined);
    }
    if (endAt) {
      const { date, time } = isoToParts(endAt);
      setEndDateDraft(date);
      setEndTimeDraft(time);
    } else {
      setEndDateDraft(undefined);
      setEndTimeDraft(undefined);
    }
    setDateError(undefined);
    setEditingDates(true);
  }

  async function handleDoneEditingDates() {
    setDateError(undefined);
    const startValid = !!startDateDraft === !!startTimeDraft;
    const endValid = !!endDateDraft === !!endTimeDraft;

    const newStartAt = startValid ? (combineDateAndTimeToIso(startDateDraft, startTimeDraft) ?? "") : undefined;
    const newEndAt = endValid ? (combineDateAndTimeToIso(endDateDraft, endTimeDraft) ?? "") : undefined;

    if (newStartAt && newEndAt && new Date(newEndAt) < new Date(newStartAt)) {
      setDateError(`${ANCHOR_LABELS[type].end} must be after ${ANCHOR_LABELS[type].start.toLowerCase()}.`);
      return;
    }

    // A cleared time is sent as null; an unchanged or half-filled one is left out.
    const patch: ReservationPatchBody = {};
    if (newStartAt !== undefined && newStartAt !== (startAt ?? "")) patch.startAt = newStartAt || null;
    if (newEndAt !== undefined && newEndAt !== (endAt ?? "")) patch.endAt = newEndAt || null;
    if (Object.keys(patch).length > 0) {
      if (savingDatesRef.current) return;

      savingDatesRef.current = true;
      try {
        await patchReservation(reservationId, patch);
        onSaved({
          startAt: newStartAt !== undefined ? newStartAt || undefined : startAt,
          endAt: newEndAt !== undefined ? newEndAt || undefined : endAt,
        });
      } catch (error) {
        setDateError(error instanceof Error ? error.message : "Failed to save dates.");
        return;
      } finally {
        savingDatesRef.current = false;
      }
    }

    if (!startValid || !endValid) {
      setDateError("Enter both a date and a time.");
      return;
    }
    setEditingDates(false);
  }

  return (
    <div style={{ fontSize: 13 }}>
      {!editingDates ? (
        <button
          type="button"
          onClick={handleOpenDateEdit}
          style={startAt || endAt ? FIELD_VALUE_STYLE : PLACEHOLDER_STYLE}
        >
          {startAt || endAt ? formatReservationDateRange(startAt, endAt) : "Add dates"}
        </button>
      ) : (
        <div
          ref={dateEditRef}
          tabIndex={-1}
          className="flex flex-col gap-2"
          style={{ outline: "none" }}
          onBlur={(event) => {
            if (!isCalendarOpenRef.current && !event.currentTarget.contains(event.relatedTarget)) {
              void handleDoneEditingDates();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setDateError(undefined);
              setEditingDates(false);
            }
          }}
        >
          <div className="flex items-center gap-2">
            <span style={FIELD_LABEL_STYLE}>{ANCHOR_LABELS[type].start}</span>
            <DatePicker
              value={startDateDraft}
              onChange={setStartDateDraft}
              clearable={false}
              onOpenChange={(open) => {
                isCalendarOpenRef.current = open;
              }}
              aria-label={`${ANCHOR_LABELS[type].start} date`}
              aria-invalid={!!dateError}
            />
            <TimePicker
              value={startTimeDraft}
              onChange={setStartTimeDraft}
              aria-label={`${ANCHOR_LABELS[type].start} time`}
              aria-invalid={!!dateError}
            />
          </div>
          <div className="flex items-center gap-2">
            <span style={FIELD_LABEL_STYLE}>{ANCHOR_LABELS[type].end}</span>
            <DatePicker
              value={endDateDraft}
              onChange={setEndDateDraft}
              clearable={false}
              onOpenChange={(open) => {
                isCalendarOpenRef.current = open;
              }}
              aria-label={`${ANCHOR_LABELS[type].end} date`}
              aria-invalid={!!dateError}
            />
            <TimePicker
              value={endTimeDraft}
              onChange={setEndTimeDraft}
              aria-label={`${ANCHOR_LABELS[type].end} time`}
              aria-invalid={!!dateError}
            />
          </div>
          {dateError && (
            <p role="status" aria-live="polite" style={{ fontSize: 11, color: "var(--destructive)" }}>
              {dateError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
