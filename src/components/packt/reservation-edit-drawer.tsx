"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { RetrievedLocation } from "@/app/(app)/trips/actions";
import { Drawer, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Section, Field } from "@/components/packt/form-section";
import { LocationLookupInput } from "@/components/packt/location-lookup-input";
import { ReservationAnchorFieldset } from "@/components/packt/reservation-anchor-fieldset";
import { ANCHOR_LABELS, RESERVATION_TYPE_META, SERVICE_NUMBER_LABELS } from "@/components/packt/reservation-type-badge";
import { createReservation } from "@/app/(app)/trips/[tripId]/reservations/actions";
import { ReservationType, type CreateReservationInput, type SavedLocationValue } from "@/data/types";
import { combineDateAndTimeToIso } from "@/lib/utils";
import { FileText } from "lucide-react";

export interface ReservationEditDrawerProps {
  tripId: string;
  type: ReservationType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const REQUIRES_END_AT: ReservationType[] = [ReservationType.Lodging, ReservationType.RentalCar, ReservationType.Cruise];

function combineAnchor(date: string | undefined, time: string | undefined): { iso?: string; error?: string } {
  const hasDate = !!date;
  const hasTime = !!time;
  if (hasDate !== hasTime) {
    return { error: "Enter both a date and a time." };
  }
  return { iso: combineDateAndTimeToIso(date, time) };
}

function focusAnchor(ref: React.RefObject<HTMLDivElement | null>): void {
  ref.current?.querySelector<HTMLElement>("input, button")?.focus();
}

export function ReservationEditDrawer({ tripId, type, open, onOpenChange }: ReservationEditDrawerProps) {
  const [provider, setProvider] = useState("");
  const [startDate, setStartDate] = useState<string | undefined>(undefined);
  const [startTime, setStartTime] = useState<string | undefined>(undefined);
  const [endDate, setEndDate] = useState<string | undefined>(undefined);
  const [endTime, setEndTime] = useState<string | undefined>(undefined);
  const [startAddress, setStartAddress] = useState("");
  const [startResolvedLocation, setStartResolvedLocation] = useState<SavedLocationValue | undefined>(undefined);
  const [endAddress, setEndAddress] = useState("");
  const [endResolvedLocation, setEndResolvedLocation] = useState<SavedLocationValue | undefined>(undefined);
  const [cost, setCost] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [serviceNumber, setServiceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [providerError, setProviderError] = useState<string | undefined>(undefined);
  const [startAtError, setStartAtError] = useState<string | undefined>(undefined);
  const [endAtError, setEndAtError] = useState<string | undefined>(undefined);
  const [costError, setCostError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const providerInputRef = useRef<HTMLInputElement | null>(null);
  const startAnchorRef = useRef<HTMLDivElement | null>(null);
  const endAnchorDateRef = useRef<HTMLDivElement | null>(null);

  const { label, icon: Icon } = RESERVATION_TYPE_META[type];
  const anchorLabels = ANCHOR_LABELS[type];
  const serviceNumberLabel = SERVICE_NUMBER_LABELS[type];
  const endAtRequired = REQUIRES_END_AT.includes(type);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (open) {
      providerInputRef.current?.focus();
    } else {
      setProvider("");
      setStartDate(undefined);
      setStartTime(undefined);
      setEndDate(undefined);
      setEndTime(undefined);
      setStartAddress("");
      setStartResolvedLocation(undefined);
      setEndAddress("");
      setEndResolvedLocation(undefined);
      setCost("");
      setConfirmationCode("");
      setServiceNumber("");
      setNotes("");
      setProviderError(undefined);
      setStartAtError(undefined);
      setEndAtError(undefined);
      setCostError(undefined);
      setSaving(false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open]);

  async function handleSave(): Promise<void> {
    setProviderError(undefined);
    setStartAtError(undefined);
    setEndAtError(undefined);
    setCostError(undefined);

    if (!provider.trim()) {
      setProviderError("Provider is required.");
      providerInputRef.current?.focus();
      return;
    }

    const start = combineAnchor(startDate, startTime);
    if (start.error) {
      setStartAtError(start.error);
      focusAnchor(startAnchorRef);
      return;
    }

    const end = combineAnchor(endDate, endTime);
    if (end.error) {
      setEndAtError(end.error);
      focusAnchor(endAnchorDateRef);
      return;
    }

    if (endAtRequired && !end.iso) {
      setEndAtError(`${anchorLabels.end} is required for this reservation type.`);
      focusAnchor(endAnchorDateRef);
      return;
    }

    if (end.iso && !start.iso) {
      setStartAtError(`${anchorLabels.start} is required when ${anchorLabels.end.toLowerCase()} is set.`);
      focusAnchor(startAnchorRef);
      return;
    }

    if (start.iso && end.iso && new Date(end.iso).getTime() < new Date(start.iso).getTime()) {
      setEndAtError(`${anchorLabels.end} must be after ${anchorLabels.start.toLowerCase()}.`);
      focusAnchor(endAnchorDateRef);
      return;
    }

    if (cost && isNaN(parseFloat(cost))) {
      setCostError("Cost must be a valid number.");
      return;
    }

    setSaving(true);

    const input: CreateReservationInput = {
      type,
      provider: provider.trim(),
      startAt: start.iso,
      endAt: end.iso,
      startAddress: startAddress || undefined,
      startLocationName: startResolvedLocation?.name,
      startLocationLat: startResolvedLocation?.lat,
      startLocationLng: startResolvedLocation?.lng,
      endAddress: endAddress || undefined,
      endLocationName: endResolvedLocation?.name,
      endLocationLat: endResolvedLocation?.lat,
      endLocationLng: endResolvedLocation?.lng,
      cost: cost ? parseFloat(cost) : undefined,
      confirmationCode: confirmationCode || undefined,
      serviceNumber: serviceNumber || undefined,
      notes: notes || undefined,
    };

    try {
      await createReservation(tripId, input);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save reservation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={(isOpen) => !saving && onOpenChange(isOpen)} direction="right">
      <DrawerContent className="flex flex-col p-0 rounded-none">
        <DrawerHeader
          className="px-5 pt-5 pb-4 shrink-0 flex-row items-center gap-3"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <div
            className="flex items-center justify-center rounded-lg shrink-0"
            style={{ width: 32, height: 32, background: "var(--surface-2)" }}
          >
            <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
          </div>
          <div>
            <DrawerTitle>Add {label} Reservation</DrawerTitle>
            <p style={{ fontSize: "calc(11px * var(--font-scale))", color: "var(--fg-3)" }}>
              Type: {label} (cannot be changed after saving)
            </p>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4.5">
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

            <div ref={endAnchorDateRef}>
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
                onResolved={(location: RetrievedLocation) =>
                  setStartResolvedLocation({
                    name: location.fullAddress !== location.placeName ? location.name : undefined,
                    address: location.fullAddress,
                    lat: location.center[1],
                    lng: location.center[0],
                  })
                }
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
                onResolved={(location: RetrievedLocation) =>
                  setEndResolvedLocation({
                    name: location.fullAddress !== location.placeName ? location.name : undefined,
                    address: location.fullAddress,
                    lat: location.center[1],
                    lng: location.center[0],
                  })
                }
                onClearResolved={() => setEndResolvedLocation(undefined)}
                disabled={saving}
              />
            </Field>

            <Field label="Cost (Optional)" htmlFor="reservation-cost" error={costError}>
              <Input
                id="reservation-cost"
                className="h-9"
                inputMode="decimal"
                value={cost}
                onChange={(event) => setCost(event.target.value)}
                aria-invalid={!!costError}
                disabled={saving}
              />
            </Field>

            <Field label="Confirmation code (Optional)" htmlFor="reservation-confirmation-code">
              <Input
                id="reservation-confirmation-code"
                className="h-9"
                value={confirmationCode}
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
                onChange={(event) => setNotes(event.target.value)}
                disabled={saving}
              />
            </Field>
          </Section>

          <Section title="Documents">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText strokeWidth={1.5} />
                </EmptyMedia>
                <EmptyTitle>No documents yet</EmptyTitle>
                <EmptyDescription>
                  Attach a hotel confirmation, receipt, or other reservation document.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent />
            </Empty>
          </Section>
        </div>

        <DrawerFooter className="shrink-0 gap-3" style={{ borderTop: "1px solid var(--line)" }}>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
