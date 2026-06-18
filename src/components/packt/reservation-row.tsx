"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Trash2, Wallet, MapPin, DollarSign, Upload } from "lucide-react";
import { toast } from "sonner";
import { IconSize } from "@/lib/size-tokens";
import { ANCHOR_LABELS, formatReservationDateRange } from "@/components/packt/reservation-type-badge";
import { ReservationInlineTextField } from "@/components/packt/reservation-inline-text-field";
import { DeleteReservationAlertDialog } from "@/components/packt/delete-reservation-alert-dialog";
import { DocKindBadge } from "@/components/packt/doc-kind-badge";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import {
  updateReservation,
  deleteReservation,
  uploadReservationDocument,
  removeReservationDocument,
} from "@/app/(app)/trips/[tripId]/reservations/actions";
import { CostDialog } from "@/components/packt/cost-dialog";
import { ReservationFieldDialog } from "@/components/packt/reservation-field-dialog";
import { ReservationType, type Reservation, type SavedLocationValue, type UpdateReservationPatch } from "@/data/types";
import { combineDateAndTimeToIso, getLocationDisplayLabel, MAX_UPLOAD_BYTES } from "@/lib/utils";

export interface ReservationRowProps {
  reservation: Reservation;
  type: ReservationType;
  isLast: boolean;
}

const FIELD_LABEL_STYLE: React.CSSProperties = { color: "var(--fg-3)", minWidth: 68, fontSize: 13 };
const FIELD_VALUE_STYLE: React.CSSProperties = { color: "var(--fg-2)", fontSize: 13 };
const PLACEHOLDER_STYLE: React.CSSProperties = { color: "var(--fg-3)", fontSize: 13, fontStyle: "italic" };

function buildSavedLocationValue(
  address: string | undefined,
  name?: string,
  lat?: number,
  lng?: number
): SavedLocationValue | undefined {
  return address
    ? {
        address,
        name,
        lat,
        lng,
      }
    : undefined;
}

export function ReservationRow({ reservation, type, isLast }: ReservationRowProps) {
  const [provider, setProvider] = useState(reservation.provider);
  const [startAt, setStartAt] = useState<string | undefined>(reservation.startAt);
  const [endAt, setEndAt] = useState<string | undefined>(reservation.endAt);
  const [startLocation, setStartLocation] = useState<SavedLocationValue | undefined>(
    buildSavedLocationValue(
      reservation.startAddress,
      reservation.startLocationName,
      reservation.startLocationLat,
      reservation.startLocationLng
    )
  );
  const [endLocation, setEndLocation] = useState<SavedLocationValue | undefined>(
    buildSavedLocationValue(
      reservation.endAddress,
      reservation.endLocationName,
      reservation.endLocationLat,
      reservation.endLocationLng
    )
  );
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
  const [isUploading, startUploadTransition] = useTransition();
  const [, startRemoveTransition] = useTransition();
  const [removingDocId, setRemovingDocId] = useState<string | null>(null);
  const deletingRef = useRef(false);
  const isCalendarOpenRef = useRef(false);
  const dateEditRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const startLocationLabel = getLocationDisplayLabel(startLocation?.name, startLocation?.address);
  const endLocationLabel = getLocationDisplayLabel(endLocation?.name, endLocation?.address);

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
    const startValid = !!startDateDraft === !!startTimeDraft;
    const endValid = !!endDateDraft === !!endTimeDraft;

    const newStartAt = startValid ? (combineDateAndTimeToIso(startDateDraft, startTimeDraft) ?? "") : undefined;
    const newEndAt = endValid ? (combineDateAndTimeToIso(endDateDraft, endTimeDraft) ?? "") : undefined;

    if (newStartAt && newEndAt && new Date(newEndAt) < new Date(newStartAt)) {
      setDateError(`${ANCHOR_LABELS[type].end} must be after ${ANCHOR_LABELS[type].start.toLowerCase()}.`);
      return;
    }

    const patch: UpdateReservationPatch = {};
    if (newStartAt !== undefined && newStartAt !== (startAt ?? "")) patch.startAt = newStartAt;
    if (newEndAt !== undefined && newEndAt !== (endAt ?? "")) patch.endAt = newEndAt;
    if (Object.keys(patch).length > 0) {
      try {
        await updateReservation(reservation.id, patch);
        if (newStartAt !== undefined) setStartAt(newStartAt || undefined);
        if (newEndAt !== undefined) setEndAt(newEndAt || undefined);
      } catch (error) {
        setDateError(error instanceof Error ? error.message : "Failed to save dates.");
        return;
      }
    }

    if (!startValid || !endValid) {
      setDateError("Enter both a date and a time.");
      return;
    }
    setEditingDates(false);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("File is too large. Max 25 MB.");
      if (uploadInputRef.current) uploadInputRef.current.value = "";
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    startUploadTransition(async () => {
      try {
        await uploadReservationDocument(reservation.id, formData);
      } catch {
        toast.error("Upload failed. Please try again.");
      } finally {
        if (uploadInputRef.current) uploadInputRef.current.value = "";
      }
    });
  }

  function handleRemoveDoc(docId: string) {
    if (removingDocId) return;
    setRemovingDocId(docId);
    startRemoveTransition(async () => {
      try {
        await removeReservationDocument(docId);
      } catch {
        toast.error("Failed to remove document.");
      } finally {
        setRemovingDocId(null);
      }
    });
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
      <div className="flex items-center gap-1 flex-wrap mt-2">
        <button
          type="button"
          onClick={() => setShowStartAddressDialog(true)}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
          style={{
            fontSize: "calc(var(--fs-action-chip) * var(--font-scale))",
            color: startLocation?.address ? "var(--accent-ink)" : "var(--fg-4)",
            background: startLocation?.address ? "var(--accent-soft)" : "none",
            border: "1px solid transparent",
            maxWidth: 180,
          }}
        >
          <MapPin size={IconSize.actionChip} strokeWidth={1.5} style={{ flexShrink: 0 }} aria-hidden="true" />
          <span className="truncate">
            {startLocation?.address
              ? `${ANCHOR_LABELS[type].start} · ${startLocationLabel}`
              : `Add ${ANCHOR_LABELS[type].start.toLowerCase()} address`}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setShowEndAddressDialog(true)}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
          style={{
            fontSize: "calc(var(--fs-action-chip) * var(--font-scale))",
            color: endLocation?.address ? "var(--accent-ink)" : "var(--fg-4)",
            background: endLocation?.address ? "var(--accent-soft)" : "none",
            border: "1px solid transparent",
            maxWidth: 180,
          }}
        >
          <MapPin size={IconSize.actionChip} strokeWidth={1.5} style={{ flexShrink: 0 }} aria-hidden="true" />
          <span className="truncate">
            {endLocation?.address
              ? `${ANCHOR_LABELS[type].end} · ${endLocationLabel}`
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
      <input
        ref={uploadInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
        aria-label="Upload document"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
        onChange={handleFileChange}
      />
      {(reservation.documents ?? []).length === 0 ? (
        <button
          type="button"
          aria-label="Add confirmation document"
          onClick={() => uploadInputRef.current?.click()}
          disabled={isUploading}
          className="inline-flex items-center gap-1.5 h-8 rounded px-3 mt-2"
          style={{
            border: "1px dashed var(--line)",
            background: "transparent",
            color: "var(--fg-3)",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          <Upload size={12} strokeWidth={1.5} aria-hidden="true" />
          Add confirmation document
        </button>
      ) : (
        <div className="mt-1.5 flex flex-col gap-1">
          {(reservation.documents ?? []).map((doc) => (
            <div key={doc.id} className="flex items-center gap-1.5">
              <DocKindBadge kind={doc.kind} />
              <span
                style={{
                  fontSize: 12,
                  color: "var(--fg-2)",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {doc.name}
              </span>
              <button
                type="button"
                title={`Remove ${doc.name}`}
                aria-label={`Remove ${doc.name}`}
                onClick={() => handleRemoveDoc(doc.id)}
                disabled={removingDocId === doc.id}
                className="inline-flex items-center justify-center size-8 shrink-0 rounded"
                style={{ border: "none", background: "transparent", color: "var(--fg-3)", cursor: "pointer" }}
              >
                <Trash2 size={13} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
      {(reservation.documents ?? []).length > 0 && (
        <button
          type="button"
          title="Add document"
          aria-label="Add document"
          onClick={() => uploadInputRef.current?.click()}
          disabled={isUploading}
          className="inline-flex items-center justify-center size-8 shrink-0 rounded mt-0.5"
          style={{ border: "none", background: "transparent", color: "var(--fg-3)", cursor: "pointer" }}
        >
          <Upload size={13} strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
      <ReservationFieldDialog
        mode="location"
        title={`${ANCHOR_LABELS[type].start} address`}
        value={startLocation?.address}
        locationName={startLocation?.name}
        locationLat={startLocation?.lat}
        locationLng={startLocation?.lng}
        placeholder="Enter address or place name"
        open={showStartAddressDialog}
        onOpenChange={setShowStartAddressDialog}
        onSave={(next) => {
          void updateReservation(
            reservation.id,
            next
              ? {
                  startAddress: next.address,
                  startLocationName: next.name,
                  startLocationLat: next.lat,
                  startLocationLng: next.lng,
                }
              : { startAddress: "" }
          )
            .then(() => setStartLocation(next))
            .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to save."));
        }}
      />
      <ReservationFieldDialog
        mode="location"
        title={`${ANCHOR_LABELS[type].end} address`}
        value={endLocation?.address}
        locationName={endLocation?.name}
        locationLat={endLocation?.lat}
        locationLng={endLocation?.lng}
        placeholder="Enter address or place name"
        open={showEndAddressDialog}
        onOpenChange={setShowEndAddressDialog}
        onSave={(next) => {
          void updateReservation(
            reservation.id,
            next
              ? {
                  endAddress: next.address,
                  endLocationName: next.name,
                  endLocationLat: next.lat,
                  endLocationLng: next.lng,
                }
              : { endAddress: "" }
          )
            .then(() => setEndLocation(next))
            .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to save."));
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
          void updateReservation(reservation.id, { confirmationCode: next ?? "" })
            .then(() => setConfirmationCode(next))
            .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to save."));
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
