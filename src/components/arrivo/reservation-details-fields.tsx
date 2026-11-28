"use client";

import type { RetrievedLocation } from "@/app/(app)/trips/actions";
import { Input } from "@/components/ui/input";
import { Section, Field } from "@/components/arrivo/form-section";
import { LocationLookupInput } from "@/components/arrivo/location-lookup-input";
import { ReservationAnchorFieldset } from "@/components/arrivo/reservation-anchor-fieldset";
import { ANCHOR_LABELS, SERVICE_NUMBER_LABELS } from "@/components/arrivo/reservation-type-badge";
import type { ReservationDraft } from "@/components/arrivo/use-reservation-draft";
import { REQUIRES_END_AT } from "@/lib/reservation-types";
import type { ReservationType, SavedLocationValue } from "@/data/types";
import { FIELD_LIMITS } from "@/lib/validation-limits";

export interface ReservationDetailsFieldsProps {
  type: ReservationType;
  draft: ReservationDraft;
}

function toSavedLocation(location: RetrievedLocation): SavedLocationValue {
  return {
    name: location.fullAddress !== location.placeName ? location.name : undefined,
    address: location.fullAddress,
    lat: location.center[1],
    lng: location.center[0],
  };
}

export function ReservationDetailsFields({ type, draft }: ReservationDetailsFieldsProps) {
  const {
    provider,
    startDate,
    startTime,
    endDate,
    endTime,
    startAddress,
    startResolvedLocation,
    endAddress,
    endResolvedLocation,
    confirmationCode,
    serviceNumber,
    notes,
    providerError,
    startAtError,
    endAtError,
    saving,
    providerInputRef,
    startAnchorRef,
    endAnchorRef,
    setProvider,
    setStartDate,
    setStartTime,
    setEndDate,
    setEndTime,
    setStartAddress,
    setStartResolvedLocation,
    setEndAddress,
    setEndResolvedLocation,
    setConfirmationCode,
    setServiceNumber,
    setNotes,
  } = draft;

  const anchorLabels = ANCHOR_LABELS[type];
  const serviceNumberLabel = SERVICE_NUMBER_LABELS[type];
  const endAtRequired = REQUIRES_END_AT.includes(type);

  return (
    <Section title="Details">
      <Field
        label={
          <>
            Provider <span style={{ color: "var(--accent-brand)" }}>*</span>
          </>
        }
        htmlFor="reservation-provider"
        error={providerError}
      >
        <Input
          id="reservation-provider"
          ref={providerInputRef}
          className="h-9"
          value={provider}
          maxLength={FIELD_LIMITS.provider}
          onChange={(event) => setProvider(event.target.value)}
          aria-required="true"
          aria-invalid={!!providerError}
          disabled={saving}
        />
      </Field>

      <div ref={startAnchorRef}>
        <ReservationAnchorFieldset
          legend={anchorLabels.start}
          required={false}
          date={startDate}
          time={startTime}
          onDateChange={setStartDate}
          onTimeChange={setStartTime}
          error={startAtError}
        />
      </div>

      <div ref={endAnchorRef}>
        <ReservationAnchorFieldset
          legend={anchorLabels.end}
          required={endAtRequired}
          date={endDate}
          time={endTime}
          onDateChange={setEndDate}
          onTimeChange={setEndTime}
          error={endAtError}
        />
      </div>

      <Field label={`${anchorLabels.start} address (Optional)`} htmlFor="reservation-start-address">
        <LocationLookupInput
          id="reservation-start-address"
          value={startAddress}
          resolvedValue={startResolvedLocation?.address ?? null}
          className="h-9"
          onValueChange={setStartAddress}
          onResolved={(location: RetrievedLocation) => setStartResolvedLocation(toSavedLocation(location))}
          onClearResolved={() => setStartResolvedLocation(undefined)}
          disabled={saving}
        />
      </Field>

      <Field label={`${anchorLabels.end} address (Optional)`} htmlFor="reservation-end-address">
        <LocationLookupInput
          id="reservation-end-address"
          value={endAddress}
          resolvedValue={endResolvedLocation?.address ?? null}
          className="h-9"
          onValueChange={setEndAddress}
          onResolved={(location: RetrievedLocation) => setEndResolvedLocation(toSavedLocation(location))}
          onClearResolved={() => setEndResolvedLocation(undefined)}
          disabled={saving}
        />
      </Field>

      <Field label="Confirmation code (Optional)" htmlFor="reservation-confirmation-code">
        <Input
          id="reservation-confirmation-code"
          className="h-9"
          value={confirmationCode}
          maxLength={FIELD_LIMITS.confirmationCode}
          onChange={(event) => setConfirmationCode(event.target.value)}
          disabled={saving}
        />
      </Field>

      {serviceNumberLabel && (
        <Field label={`${serviceNumberLabel} (Optional)`} htmlFor="reservation-service-number">
          <Input
            id="reservation-service-number"
            className="h-9"
            value={serviceNumber}
            maxLength={FIELD_LIMITS.serviceNumber}
            onChange={(event) => setServiceNumber(event.target.value)}
            disabled={saving}
          />
        </Field>
      )}

      <Field label="Notes (Optional)" htmlFor="reservation-notes">
        <textarea
          id="reservation-notes"
          className="w-full rounded-lg border border-input bg-transparent px-3 py-1.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
          style={{ minHeight: 72 }}
          value={notes}
          maxLength={FIELD_LIMITS.reservationNotes}
          onChange={(event) => setNotes(event.target.value)}
          disabled={saving}
        />
      </Field>
    </Section>
  );
}
