"use client";

import { useState, useTransition, useRef } from "react";
import { Trash2, Wallet, FileText, ChevronDown, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { IconSize } from "@/lib/size-tokens";
import { SERVICE_NUMBER_LABELS, formatReservationDateRange } from "@/components/arrivo/reservation-type-badge";
import { ReservationInlineTextField } from "@/components/arrivo/reservation-inline-text-field";
import { DeleteReservationAlertDialog } from "@/components/arrivo/delete-reservation-alert-dialog";
import { ReservationDocsBlock } from "@/components/arrivo/reservation-docs-block";
import { AddReservationDocDialog } from "@/components/arrivo/add-reservation-doc-dialog";
import { ReservationCostChip } from "@/components/arrivo/reservation-cost-chip";
import { ReservationDateEditor } from "@/components/arrivo/reservation-date-editor";
import { buildSavedLocationValue, ReservationLocationChip } from "@/components/arrivo/reservation-location-chip";
import { useReservationPatch } from "@/components/arrivo/use-reservation-patch";
import { deleteReservation } from "@/app/(app)/trips/[tripId]/reservations/actions";
import { ReservationFieldDialog } from "@/components/arrivo/reservation-field-dialog";
import { ReservationType, type Document, type Reservation } from "@/data/types";
import { cn, pluralize } from "@/lib/utils";
import { FIELD_LIMITS } from "@/lib/validation-limits";

export interface ReservationRowProps {
  reservation: Reservation;
  type: ReservationType;
  isLast: boolean;
  tripDocs?: Document[];
  defaultCurrency?: string;
  highlighted?: boolean;
  position?: number;
  total?: number;
}

const TITLE_DISPLAY_STYLE: React.CSSProperties = {
  fontSize: "calc(var(--fs-card-title) * var(--font-scale))",
  fontWeight: 600,
  color: "var(--fg)",
};
const TITLE_INPUT_STYLE: React.CSSProperties = {
  fontSize: "calc(var(--fs-card-title) * var(--font-scale))",
  fontWeight: 600,
  flex: "none",
  width: 140,
};

export function ReservationRow({
  reservation,
  type,
  isLast,
  tripDocs,
  defaultCurrency,
  highlighted = false,
  position = 1,
  total = 1,
}: ReservationRowProps) {
  const patchReservation = useReservationPatch();
  const [provider, setProvider] = useState(reservation.provider.trim());
  const [startAt, setStartAt] = useState<string | undefined>(reservation.startAt);
  const [endAt, setEndAt] = useState<string | undefined>(reservation.endAt);
  const [confirmationCode, setConfirmationCode] = useState<string | undefined>(
    reservation.confirmationCode?.trim() || undefined
  );
  const [serviceNumber, setServiceNumber] = useState<string | undefined>(
    reservation.serviceNumber?.trim() || undefined
  );
  const [notes, setNotes] = useState<string | undefined>(reservation.notes?.trim() || undefined);
  const [showConfirmationCodeDialog, setShowConfirmationCodeDialog] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, startTransition] = useTransition();
  const [showAddDocDialog, setShowAddDocDialog] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const docs = reservation.documents ?? [];
  const hasDocs = docs.length > 0;
  const deletingRef = useRef(false);
  const serviceNumberLabel = SERVICE_NUMBER_LABELS[type];
  const reservationDateRange = formatReservationDateRange(startAt, endAt);
  const deleteLabel = reservationDateRange
    ? `Delete ${provider} reservation for ${reservationDateRange}`
    : total > 1
      ? `Delete ${provider} reservation (${position} of ${total})`
      : `Delete ${provider}`;

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
    <div
      id={`reservation-${reservation.id}`}
      data-reservation-id={reservation.id}
      data-testid={`reservation-row-${reservation.id}`}
      tabIndex={-1}
      className={cn("px-4 py-8", highlighted && "highlight-pulse-bg")}
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--line-strong)",
        ...(highlighted ? { outline: "2px solid var(--accent-brand)", outlineOffset: 2 } : {}),
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-1 items-baseline gap-2 flex-wrap">
          <ReservationInlineTextField
            value={provider}
            ariaLabel="Provider"
            maxLength={FIELD_LIMITS.provider}
            placeholder=""
            displayStyle={TITLE_DISPLAY_STYLE}
            inputStyle={{ fontSize: "calc(var(--fs-card-title) * var(--font-scale))", fontWeight: 600 }}
            onSave={async (next) => {
              await patchReservation(reservation.id, { provider: next });
              setProvider(next.trim());
            }}
          />
          {serviceNumberLabel && (
            <ReservationInlineTextField
              value={serviceNumber ?? ""}
              ariaLabel={serviceNumberLabel}
              maxLength={FIELD_LIMITS.serviceNumber}
              placeholder={`Add ${serviceNumberLabel.toLowerCase()}`}
              displayStyle={TITLE_DISPLAY_STYLE}
              inputStyle={TITLE_INPUT_STYLE}
              onSave={async (next) => {
                await patchReservation(reservation.id, { serviceNumber: next || null });
                setServiceNumber(next || undefined);
              }}
            />
          )}
        </div>
        <button
          type="button"
          title={deleteLabel}
          aria-label={deleteLabel}
          onClick={() => setConfirmOpen(true)}
          className="inline-flex items-center justify-center size-8 shrink-0 rounded"
          style={{ border: "none", background: "transparent", color: "var(--fg-3)", cursor: "pointer" }}
        >
          <Trash2 size={15} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
      <ReservationDateEditor
        reservationId={reservation.id}
        type={type}
        startAt={startAt}
        endAt={endAt}
        onSaved={(dates) => {
          setStartAt(dates.startAt);
          setEndAt(dates.endAt);
        }}
      />
      <div className="flex items-center gap-1 flex-wrap mt-2">
        <ReservationLocationChip
          reservationId={reservation.id}
          type={type}
          side="start"
          initialLocation={buildSavedLocationValue(
            reservation.startAddress,
            reservation.startLocationName,
            reservation.startLocationLat,
            reservation.startLocationLng
          )}
        />
        <ReservationLocationChip
          reservationId={reservation.id}
          type={type}
          side="end"
          initialLocation={buildSavedLocationValue(
            reservation.endAddress,
            reservation.endLocationName,
            reservation.endLocationLat,
            reservation.endLocationLng
          )}
        />
        <ReservationCostChip
          reservationId={reservation.id}
          tripId={reservation.tripId}
          expense={reservation.expense}
          defaultCurrency={defaultCurrency}
        />
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
        {hasDocs ? (
          <button
            type="button"
            onClick={() => setShowDocs((prev) => !prev)}
            aria-expanded={showDocs}
            title="Show attached documents"
            className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
            style={{
              fontSize: "calc(var(--fs-action-chip) * var(--font-scale))",
              color: "var(--accent-ink)",
              background: "var(--accent-soft)",
              border: "1px solid transparent",
            }}
          >
            <FileText size={IconSize.actionChip} strokeWidth={1.5} aria-hidden="true" />
            {pluralize(docs.length, "doc")}
            <ChevronDown
              size={10}
              aria-hidden="true"
              style={{
                transform: showDocs ? "rotate(180deg)" : undefined,
                transition: "transform 0.15s",
              }}
            />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddDocDialog(true)}
            title="Attach document"
            className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
            style={{
              fontSize: "calc(var(--fs-action-chip) * var(--font-scale))",
              color: "var(--fg-4)",
              border: "1px solid transparent",
            }}
          >
            <Paperclip size={IconSize.actionChip} strokeWidth={1.5} aria-hidden="true" />
            Attach
          </button>
        )}
      </div>
      <ReservationInlineTextField
        value={notes ?? ""}
        ariaLabel="Notes"
        maxLength={FIELD_LIMITS.reservationNotes}
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
          await patchReservation(reservation.id, { notes: next || null });
          setNotes(next || undefined);
        }}
      />
      {showDocs && hasDocs && (
        <ReservationDocsBlock tripId={reservation.tripId} docs={docs} onAdd={() => setShowAddDocDialog(true)} />
      )}
      <AddReservationDocDialog
        reservationId={reservation.id}
        providerName={provider}
        open={showAddDocDialog}
        onOpenChange={setShowAddDocDialog}
        tripDocs={tripDocs}
      />
      <ReservationFieldDialog
        title="Confirmation code"
        maxLength={FIELD_LIMITS.confirmationCode}
        value={confirmationCode}
        placeholder="Enter confirmation code"
        open={showConfirmationCodeDialog}
        onOpenChange={setShowConfirmationCodeDialog}
        onSave={(next) => {
          void patchReservation(reservation.id, { confirmationCode: next || null })
            .then(() => setConfirmationCode(next))
            .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to save."));
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
