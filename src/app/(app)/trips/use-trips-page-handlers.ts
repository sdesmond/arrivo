"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  TripDateConflictResolution,
  type NewTripDraft,
  type TripDateChangeConfirmation,
  type TripListEntry,
  type UpdateTripMetadataResult,
  type UpdateTripPatch,
} from "@/data/types";
import { getTripStatus, getTripDays } from "@/lib/utils";
import { createTrip, updateTripMetadata } from "./actions";

export type MobileTab = "Unscheduled" | "Active" | "Upcoming" | "Past";

export function useTripsPageHandlers(initialEntries: TripListEntry[], now: Date) {
  const [editingTrip, setEditingTrip] = useState<string | null>(null);
  const [newTripOpen, setNewTripOpen] = useState(false);
  const [isCreating, startCreation] = useTransition();
  const [savingTrip, startTripSave] = useTransition();
  const [pendingDraft, setPendingDraft] = useState<{ draft: NewTripDraft; dayCount: number } | null>(null);
  const [pendingTripPatch, setPendingTripPatch] = useState<UpdateTripPatch | null>(null);
  const [tripDateConfirmation, setTripDateConfirmation] = useState<TripDateChangeConfirmation | null>(null);

  const unscheduledEntries: TripListEntry[] = [];
  const datedEntries: TripListEntry[] = [];
  for (const entry of initialEntries) {
    if (!entry.trip.startDate && !entry.trip.endDate) {
      unscheduledEntries.push(entry);
    } else {
      datedEntries.push(entry);
    }
  }

  const activeEntries = datedEntries.filter((e) => getTripStatus(e.trip.startDate, e.trip.endDate, now) === "active");
  const upcomingEntries = datedEntries.filter(
    (e) => getTripStatus(e.trip.startDate, e.trip.endDate, now) === "upcoming"
  );
  const pastEntries = datedEntries.filter((e) => getTripStatus(e.trip.startDate, e.trip.endDate, now) === "past");

  const activeEntry = activeEntries[0] ?? null;
  const upcomingTrips = upcomingEntries.map((e) => e.trip);
  const pastTrips = pastEntries.map((e) => e.trip);

  const defaultTab: MobileTab =
    activeEntry !== null ? "Active" : unscheduledEntries.length > 0 ? "Unscheduled" : "Upcoming";
  const [mobileTab, setMobileTab] = useState<MobileTab>(defaultTab);

  const nextInDays =
    upcomingTrips.length > 0
      ? Math.min(
          ...upcomingTrips.map((trip) => {
            const today = new Date(now);
            today.setHours(0, 0, 0, 0);
            const startTime = trip.startDate ? new Date(trip.startDate + "T00:00:00").getTime() : Infinity;
            return Math.ceil((startTime - today.getTime()) / (1000 * 60 * 60 * 24));
          })
        )
      : null;

  function handleCreate(draft: NewTripDraft) {
    const dayCount = draft.startDate ? getTripDays(draft.startDate, draft.endDate ?? draft.startDate) : 0;

    if (dayCount >= 45) {
      toast.error("Max trip length is 45 days. Please shorten your date range.");
      return;
    }

    if (dayCount >= 30) {
      setPendingDraft({ draft, dayCount });
      return;
    }

    submitCreateTrip(draft);
  }

  async function submitCreateTrip(draft: NewTripDraft) {
    startCreation(async () => {
      try {
        await createTrip({
          name: draft.title,
          startDate: draft.startDate,
          endDate: draft.endDate,
          budgetTotal: draft.budgetAmount ? parseFloat(draft.budgetAmount) : undefined,
        });
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e) throw e;
        toast.error("Failed to create trip. Please try again.");
      }
    });
  }

  function closeTripEditSheet(): void {
    setEditingTrip(null);
    setPendingTripPatch(null);
    setTripDateConfirmation(null);
  }

  function handleTripSave(
    tripId: string,
    patch: UpdateTripPatch,
    resolution?: TripDateConflictResolution,
    confirmation?: TripDateChangeConfirmation
  ): Promise<UpdateTripMetadataResult | undefined> {
    return new Promise((resolve) => {
      startTripSave(async () => {
        try {
          const result = await updateTripMetadata(tripId, patch, resolution, confirmation);
          if (result.status === "saved") {
            closeTripEditSheet();
          } else {
            setPendingTripPatch(patch);
            setTripDateConfirmation(result.confirmation);
          }
          resolve(result);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to save trip changes. Please try again.");
          resolve(undefined);
        }
      });
    });
  }

  function handleTripSaveResolution(
    resolution: TripDateConflictResolution
  ): Promise<UpdateTripMetadataResult | undefined> | undefined {
    if (!editingTrip || !pendingTripPatch || !tripDateConfirmation) return undefined;
    return handleTripSave(editingTrip, pendingTripPatch, resolution, tripDateConfirmation);
  }

  function cancelTripDateChange(): void {
    setPendingTripPatch(null);
    setTripDateConfirmation(null);
  }

  const editingEntry = editingTrip ? (initialEntries.find((e) => e.trip.id === editingTrip) ?? null) : null;

  return {
    unscheduledEntries,
    activeEntry,
    upcomingTrips,
    pastTrips,
    editingTrip,
    editingEntry,
    newTripOpen,
    isCreating,
    savingTrip,
    pendingDraft,
    pendingTripPatch,
    tripDateConfirmation,
    mobileTab,
    nextInDays,
    setEditingTrip,
    setNewTripOpen,
    setPendingDraft,
    setMobileTab,
    closeTripEditSheet,
    cancelTripDateChange,
    handleCreate,
    handleTripSave,
    handleTripSaveResolution,
    submitCreateTrip,
  };
}
