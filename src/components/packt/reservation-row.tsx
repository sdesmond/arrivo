"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Trash2, Wallet, MapPin, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { IconSize } from "@/lib/size-tokens";
import { ANCHOR_LABELS, formatReservationDateRange } from "@/components/packt/reservation-type-badge";
import { ReservationInlineTextField } from "@/components/packt/reservation-inline-text-field";
import { DeleteReservationAlertDialog } from "@/components/packt/delete-reservation-alert-dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { updateReservation, deleteReservation } from "@/app/(app)/trips/[tripId]/reservations/actions";
import { CostDialog } from "@/components/packt/cost-dialog";
import { ReservationFieldDialog } from "@/components/packt/reservation-field-dialog";
import { ReservationType, type Reservation, type UpdateReservationPatch } from "@/data/types";

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
  const [startAddress, setStartAddress] = useState<string | undefined>(reservation.startAddress);
  const [endAddress, setEndAddress] = useState<string | undefined>(reservation.endAddress);
  const [cost, setCost] = useState<number | undefined>(reservation.cost);
  const [confirmationCode, setConfirmationCode] = useState<string | undefined>(reservation.confirmationCode);
  const [notes, setNotes] = useState<string | undefined>(reservation.notes);
  const [showStartAddressDialog, setShowStartAddressDialog] = useState(false);
  const [showEndAddressDialog, setShowEndAddressDialog] = useState(false);
  const [showCostDialog, setShowCostDialog] = useState(false);
  const [showConfirmationCodeDialog, setShowConfirmationCodeDialog] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editingDates, setEditingDates] = useState(false);
  const [startDateDraft, setStartDateDraft] = useState<string | undefined>(undefined);
  const [startTimeDraft, setStartTimeDraft] = useState<string | undefined>(undefined);
  const [endDateDraft, setEndDateDraft] = useState<string | undefined>(undefined);
  const [endTimeDraft, setEndTimeDraft] = useState<string | undefined>(undefined);
  const [dateError, setDateError] = useState<string | undefined>(undefined);
  const costDisplay =
    cost != null
      ? new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cost)
      : "";
  const [isDeleting, startTransition] = useTransition();
  const deletingRef = useRef(false);
  const isCalendarOpenRef = useRef(false);
  const dateEditRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editingDates) {
      dateEditRef.current?.focus();
    }
  }, [editingDates]);

  function isoToParts(iso: string): { date: string; time: string } {
    const date = new Date(iso);
    return {
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
    };
  }

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
    const startHasDate = !!startDateDraft;
    const startHasTime = !!startTimeDraft;
    if (startHasDate !== startHasTime) {
      setDateError("Enter both a date and a time.");
      return;
    }
    const endHasDate = !!endDateDraft;
    const endHasTime = !!endTimeDraft;
    if (endHasDate !== endHasTime) {
      setDateError("Enter both a date and a time.");
      return;
    }
    const newStartAt = startHasDate ? new Date(`${startDateDraft}T${startTimeDraft}:00`).toISOString() : "";
    const newEndAt = endHasDate ? new Date(`${endDateDraft}T${endTimeDraft}:00`).toISOString() : "";
    if (newStartAt && newEndAt && new Date(newEndAt) < new Date(newStartAt)) {
      setDateError(`${ANCHOR_LABELS[type].end} must be after ${ANCHOR_LABELS[type].start.toLowerCase()}.`);
      return;
    }
    const patch: UpdateReservationPatch = {};
    if (newStartAt !== (startAt ?? "")) patch.startAt = newStartAt;
    if (newEndAt !== (endAt ?? "")) patch.endAt = newEndAt;
    if (Object.keys(patch).length > 0) {
      try {
        await updateReservation(reservation.id, patch);
        setStartAt(newStartAt || undefined);
        setEndAt(newEndAt || undefined);
      } catch (error) {
        setDateError(error instanceof Error ? error.message : "Failed to save dates.");
        return;
      }
    }
    setEditingDates(false);
  }

  function handleConfirmDelete() {
    if (deletingRef.current) return;
    deletingRef.current = true;
    startTransition(async () => {
      try {
        await deleteReservation(reservation.id);
        setConfirmOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete reservation.");
      } finally {
        deletingRef.current = false;
      }
    });
  }

  return (
    <div className="px-4 py-3.5" style={{ borderBottom: isLast ? "none" : "1px solid var(--line)" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
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
              setProvider(next.trim());
            }}
          />
        </div>
        <button
          type="button"
          title={`Delete ${provider}`}
          aria-label={`Delete ${provider}`}
          onClick={() => setConfirmOpen(true)}
          className="inline-flex items-center justify-center size-8 shrink-0 rounded"
          style={{ border: "none", background: "transparent", color: "var(--fg-3)", cursor: "pointer" }}
        >
          <Trash2 size={15} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
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
      <div className="flex items-center gap-1 flex-wrap mt-2">
        <button
          type="button"
          onClick={() => setShowStartAddressDialog(true)}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
          style={{
            fontSize: "calc(var(--fs-action-chip) * var(--font-scale))",
            color: startAddress ? "var(--accent-ink)" : "var(--fg-4)",
            background: startAddress ? "var(--accent-soft)" : "none",
            border: "1px solid transparent",
            maxWidth: 180,
          }}
        >
          <MapPin size={IconSize.actionChip} strokeWidth={1.5} style={{ flexShrink: 0 }} aria-hidden="true" />
          <span className="truncate">
            {startAddress
              ? `${ANCHOR_LABELS[type].start} · ${startAddress}`
              : `Add ${ANCHOR_LABELS[type].start.toLowerCase()} address`}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setShowEndAddressDialog(true)}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
          style={{
            fontSize: "calc(var(--fs-action-chip) * var(--font-scale))",
            color: endAddress ? "var(--accent-ink)" : "var(--fg-4)",
            background: endAddress ? "var(--accent-soft)" : "none",
            border: "1px solid transparent",
            maxWidth: 180,
          }}
        >
          <MapPin size={IconSize.actionChip} strokeWidth={1.5} style={{ flexShrink: 0 }} aria-hidden="true" />
          <span className="truncate">
            {endAddress
              ? `${ANCHOR_LABELS[type].end} · ${endAddress}`
              : `Add ${ANCHOR_LABELS[type].end.toLowerCase()} address`}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setShowCostDialog(true)}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
          style={{
            fontSize: "calc(var(--fs-action-chip) * var(--font-scale))",
            color: cost != null ? "var(--accent-ink)" : "var(--fg-4)",
            background: cost != null ? "var(--accent-soft)" : "none",
            border: "1px solid transparent",
          }}
        >
          <DollarSign size={IconSize.actionChip} strokeWidth={1.5} aria-hidden="true" />
          {costDisplay || "Add cost"}
        </button>
        <button
          type="button"
          onClick={() => setShowConfirmationCodeDialog(true)}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
          style={{
            fontSize: "calc(var(--fs-action-chip) * var(--font-scale))",
            color: confirmationCode ? "var(--accent-ink)" : "var(--fg-4)",
            background: confirmationCode ? "var(--accent-soft)" : "none",
            border: "1px solid transparent",
            fontFamily: confirmationCode ? "var(--font-mono-family, ui-monospace)" : undefined,
          }}
        >
          <Wallet size={IconSize.actionChip} strokeWidth={1.5} aria-hidden="true" />
          {confirmationCode || "Add confirmation code"}
        </button>
      </div>
      <ReservationInlineTextField
        value={notes ?? ""}
        ariaLabel="Notes"
        placeholder="Add notes"
        multiline
        displayStyle={{
          color: "var(--fg-2)",
          fontSize: 13,
          whiteSpace: "pre-wrap",
          textAlign: "left",
          width: "100%",
        }}
        onSave={async (next) => {
          await updateReservation(reservation.id, { notes: next });
          setNotes(next || undefined);
        }}
      />
      <ReservationFieldDialog
        title={`${ANCHOR_LABELS[type].start} address`}
        value={startAddress}
        placeholder="Enter address or place name"
        open={showStartAddressDialog}
        onOpenChange={setShowStartAddressDialog}
        onSave={(next) => {
          setStartAddress(next);
          void updateReservation(reservation.id, { startAddress: next ?? "" }).catch((err) =>
            toast.error(err instanceof Error ? err.message : "Failed to save.")
          );
        }}
      />
      <ReservationFieldDialog
        title={`${ANCHOR_LABELS[type].end} address`}
        value={endAddress}
        placeholder="Enter address or place name"
        open={showEndAddressDialog}
        onOpenChange={setShowEndAddressDialog}
        onSave={(next) => {
          setEndAddress(next);
          void updateReservation(reservation.id, { endAddress: next ?? "" }).catch((err) =>
            toast.error(err instanceof Error ? err.message : "Failed to save.")
          );
        }}
      />
      <CostDialog
        cost={cost}
        open={showCostDialog}
        onOpenChange={setShowCostDialog}
        onSave={(next) => {
          setCost(next);
          void updateReservation(reservation.id, { cost: next ?? null }).catch((err) =>
            toast.error(err instanceof Error ? err.message : "Failed to save.")
          );
        }}
      />
      <ReservationFieldDialog
        title="Confirmation code"
        value={confirmationCode}
        placeholder="Enter confirmation code"
        open={showConfirmationCodeDialog}
        onOpenChange={setShowConfirmationCodeDialog}
        onSave={(next) => {
          setConfirmationCode(next);
          void updateReservation(reservation.id, { confirmationCode: next ?? "" }).catch((err) =>
            toast.error(err instanceof Error ? err.message : "Failed to save.")
          );
        }}
        inputStyle={{ fontFamily: "var(--font-mono-family, ui-monospace)" }}
      />
      <DeleteReservationAlertDialog
        provider={provider}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
}
