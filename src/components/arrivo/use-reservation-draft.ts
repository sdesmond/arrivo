"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ANCHOR_LABELS } from "@/components/arrivo/reservation-type-badge";
import { REQUIRES_END_AT } from "@/lib/reservation-types";
import { api, ApiClientError } from "@/lib/api/client";
import { createReservation } from "@/lib/api/contract/reservations";
import { type CreateReservationInput, type ReservationType, type SavedLocationValue } from "@/data/types";
import { combineDateAndTimeToIso, createRandomId } from "@/lib/utils";

export interface UseReservationDraftOptions {
  tripId: string;
  type: ReservationType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export type ReservationDraft = ReturnType<typeof useReservationDraft>;

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

export function useReservationDraft({ tripId, type, open, onOpenChange }: UseReservationDraftOptions) {
  const router = useRouter();
  const attempt = useRef<{ id: string; input: CreateReservationInput } | null>(null);
  const [provider, setProvider] = useState("");
  const [startDate, setStartDate] = useState<string | undefined>(undefined);
  const [startTime, setStartTime] = useState<string | undefined>(undefined);
  const [endDate, setEndDate] = useState<string | undefined>(undefined);
  const [endTime, setEndTime] = useState<string | undefined>(undefined);
  const [startAddress, setStartAddress] = useState("");
  const [startResolvedLocation, setStartResolvedLocation] = useState<SavedLocationValue | undefined>(undefined);
  const [endAddress, setEndAddress] = useState("");
  const [endResolvedLocation, setEndResolvedLocation] = useState<SavedLocationValue | undefined>(undefined);
  const [confirmationCode, setConfirmationCode] = useState("");
  const [serviceNumber, setServiceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [providerError, setProviderError] = useState<string | undefined>(undefined);
  const [startAtError, setStartAtError] = useState<string | undefined>(undefined);
  const [endAtError, setEndAtError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const providerInputRef = useRef<HTMLInputElement | null>(null);
  const startAnchorRef = useRef<HTMLDivElement | null>(null);
  const endAnchorRef = useRef<HTMLDivElement | null>(null);

  const anchorLabels = ANCHOR_LABELS[type];
  const endAtRequired = REQUIRES_END_AT.includes(type);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (open) {
      providerInputRef.current?.focus();
    } else {
      attempt.current = null;
      setProvider("");
      setStartDate(undefined);
      setStartTime(undefined);
      setEndDate(undefined);
      setEndTime(undefined);
      setStartAddress("");
      setStartResolvedLocation(undefined);
      setEndAddress("");
      setEndResolvedLocation(undefined);
      setConfirmationCode("");
      setServiceNumber("");
      setNotes("");
      setProviderError(undefined);
      setStartAtError(undefined);
      setEndAtError(undefined);
      setSaving(false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open]);

  async function handleSave(): Promise<void> {
    setProviderError(undefined);
    setStartAtError(undefined);
    setEndAtError(undefined);

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
      focusAnchor(endAnchorRef);
      return;
    }

    if (endAtRequired && !end.iso) {
      setEndAtError(`${anchorLabels.end} is required for this reservation type.`);
      focusAnchor(endAnchorRef);
      return;
    }

    if (end.iso && !start.iso) {
      setStartAtError(`${anchorLabels.start} is required when ${anchorLabels.end.toLowerCase()} is set.`);
      focusAnchor(startAnchorRef);
      return;
    }

    if (start.iso && end.iso && new Date(end.iso).getTime() < new Date(start.iso).getTime()) {
      setEndAtError(`${anchorLabels.end} must be after ${anchorLabels.start.toLowerCase()}.`);
      focusAnchor(endAnchorRef);
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
      confirmationCode: confirmationCode || undefined,
      serviceNumber: serviceNumber || undefined,
      notes: notes || undefined,
    };

    try {
      attempt.current ??= { id: createRandomId(), input };
      const previousInput = attempt.current.input;
      const changed = JSON.stringify(previousInput) !== JSON.stringify(input);
      await api(createReservation, { params: { tripId }, body: { ...previousInput, id: attempt.current.id } });
      if (changed) toast.info("Your earlier reservation was saved. Your recent changes were not saved.");
      router.refresh();
      onOpenChange(false);
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408 &&
        error.status !== 409 &&
        error.status !== 429
      )
        attempt.current = null;
      toast.error(error instanceof Error ? error.message : "Failed to save reservation.");
    } finally {
      setSaving(false);
    }
  }

  return {
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
    handleSave,
  };
}
