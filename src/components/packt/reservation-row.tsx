"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { ANCHOR_LABELS } from "@/components/packt/reservation-type-badge";
import { ReservationInlineTextField } from "@/components/packt/reservation-inline-text-field";
import { ReservationAnchorEditField } from "@/components/packt/reservation-anchor-edit-field";
import { updateReservation } from "@/app/(app)/trips/[tripId]/reservations/actions";
import { ReservationType, type Reservation } from "@/data/types";

export interface ReservationRowProps {
  reservation: Reservation;
  type: ReservationType;
  isLast: boolean;
}

const FIELD_LABEL_STYLE: React.CSSProperties = { color: "var(--fg-3)", minWidth: 68, fontSize: 13 };
const FIELD_VALUE_STYLE: React.CSSProperties = { color: "var(--fg-2)", fontSize: 13 };
const PLACEHOLDER_STYLE: React.CSSProperties = { color: "var(--fg-3)", fontSize: 13, fontStyle: "italic" };

export function ReservationRow({ reservation, type, isLast }: ReservationRowProps) {
  const [provider, setProvider] = useState(reservation.provider);
  const [startAt, setStartAt] = useState<string | undefined>(reservation.startAt);
  const [endAt, setEndAt] = useState<string | undefined>(reservation.endAt);
  const [confirmationCode, setConfirmationCode] = useState<string | undefined>(reservation.confirmationCode);
  const [notes, setNotes] = useState<string | undefined>(reservation.notes);

  return (
    <div className="px-4 py-3.5" style={{ borderBottom: isLast ? "none" : "1px solid var(--line)" }}>
      <ReservationInlineTextField
        value={provider}
        ariaLabel="Provider"
        placeholder=""
        displayStyle={{
          fontSize: "calc(var(--fs-card-title) * var(--font-scale))",
          fontWeight: 600,
          color: "var(--fg)",
        }}
        inputStyle={{ fontSize: "calc(var(--fs-card-title) * var(--font-scale))", fontWeight: 600 }}
        onSave={async (next) => {
          await updateReservation(reservation.id, { provider: next });
          setProvider(next);
        }}
      />
      <div className="flex items-start gap-2" style={{ fontSize: 13 }}>
        <span style={FIELD_LABEL_STYLE}>{ANCHOR_LABELS[type].start}</span>
        <ReservationAnchorEditField
          label={ANCHOR_LABELS[type].start}
          value={startAt}
          displayStyle={FIELD_VALUE_STYLE}
          placeholderStyle={PLACEHOLDER_STYLE}
          onSave={async (iso) => {
            await updateReservation(reservation.id, { startAt: iso });
            setStartAt(iso || undefined);
          }}
        />
      </div>
      <div className="flex items-start gap-2" style={{ fontSize: 13 }}>
        <span style={FIELD_LABEL_STYLE}>{ANCHOR_LABELS[type].end}</span>
        <ReservationAnchorEditField
          label={ANCHOR_LABELS[type].end}
          value={endAt}
          displayStyle={FIELD_VALUE_STYLE}
          placeholderStyle={PLACEHOLDER_STYLE}
          onSave={async (iso) => {
            await updateReservation(reservation.id, { endAt: iso });
            setEndAt(iso || undefined);
          }}
        />
      </div>
      <ReservationInlineTextField
        value={confirmationCode ?? ""}
        ariaLabel="Confirmation code"
        placeholder="Add confirmation code"
        inputStyle={{ fontFamily: "var(--font-mono-family, ui-monospace)", fontSize: 12 }}
        renderDisplay={(code) => (
          <span
            className="inline-flex items-center gap-1 mt-1.5 rounded"
            style={{
              background: "var(--surface-2)",
              padding: "2px 8px",
              fontFamily: "var(--font-mono-family, ui-monospace)",
              fontSize: 12,
            }}
          >
            <Wallet size={12} strokeWidth={1.5} aria-hidden="true" />
            {code}
          </span>
        )}
        onSave={async (next) => {
          await updateReservation(reservation.id, { confirmationCode: next });
          setConfirmationCode(next || undefined);
        }}
      />
      <ReservationInlineTextField
        value={notes ?? ""}
        ariaLabel="Notes"
        placeholder="Add notes"
        multiline
        displayStyle={{ color: "var(--fg-2)", fontSize: 13, whiteSpace: "pre-wrap", textAlign: "left", width: "100%" }}
        onSave={async (next) => {
          await updateReservation(reservation.id, { notes: next });
          setNotes(next || undefined);
        }}
      />
    </div>
  );
}
