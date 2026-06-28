"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  TripDateConflictResolution,
  type SpendingDateRange,
  type Trip,
  type TripDateChangeConfirmation,
  type TripListEntry,
  type UpdateTripMetadataResult,
  type UpdateTripPatch,
} from "@/data/types";
import { getTripStatus } from "@/lib/utils";
import { deleteTrip, updateTripMetadata } from "@/app/(app)/trips/actions";

export type TravelHistoryView = "trips" | "spending";

export function useTravelHistoryPageHandlers(initialEntries: TripListEntry[], now: Date) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeView: TravelHistoryView = searchParams.get("view") === "spending" ? "spending" : "trips";
  const [editingTrip, setEditingTrip] = useState<string | null>(null);
  const [deletingTrip, setDeletingTrip] = useState<Trip | null>(null);
  const [savingTrip, startTripSave] = useTransition();
  const [isDeleting, startTripDelete] = useTransition();
  const [pendingTripPatch, setPendingTripPatch] = useState<UpdateTripPatch | null>(null);
  const [tripDateConfirmation, setTripDateConfirmation] = useState<TripDateChangeConfirmation | null>(null);

  const pastTrips: Trip[] = initialEntries
    .filter((entry) => getTripStatus(entry.trip.startDate, entry.trip.endDate, now) === "past")
    .map((entry) => entry.trip)
    .sort((first, second) => second.endDate!.localeCompare(first.endDate!));

  function closeTripEditSheet(): void {
    setEditingTrip(null);
    setDeletingTrip(null);
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

  function handleConfirmDeleteTrip(tripId = deletingTrip?.id): Promise<void> {
    return new Promise((resolve) => {
      if (!tripId) {
        resolve();
        return;
      }

      startTripDelete(async () => {
        try {
          await deleteTrip(tripId);
          if (editingTrip === tripId) {
            closeTripEditSheet();
          } else {
            setDeletingTrip(null);
          }
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to delete trip. Please try again.");
        } finally {
          resolve();
        }
      });
    });
  }

  const editingEntry = editingTrip ? (initialEntries.find((entry) => entry.trip.id === editingTrip) ?? null) : null;

  function handleViewChange(view: TravelHistoryView): void {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (view === "trips") {
      nextParams.delete("view");
    } else {
      nextParams.set("view", "spending");
    }
    const query = nextParams.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function handleRangeChange(range: SpendingDateRange): void {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("view", "spending");
    nextParams.set("range", range);
    const query = nextParams.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return {
    pastTrips,
    activeView,
    handleViewChange,
    handleRangeChange,
    editingTrip,
    editingEntry,
    deletingTrip,
    savingTrip,
    isDeleting,
    pendingTripPatch,
    tripDateConfirmation,
    setEditingTrip,
    setDeletingTrip,
    closeTripEditSheet,
    cancelTripDateChange,
    handleTripSave,
    handleTripSaveResolution,
    handleConfirmDeleteTrip,
  };
}
