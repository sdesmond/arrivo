"use client";

import { DeleteTripAlertDialog } from "@/components/packt/delete-trip-alert-dialog";
import { TravelHistoryList } from "@/components/packt/travel-history-list";
import { TripEditSheet } from "@/components/packt/trip-edit-sheet";
import { type TripListEntry } from "@/data/types";
import { useTravelHistoryPageHandlers } from "./use-travel-history-page-handlers";

interface TravelHistoryPageClientProps {
  initialEntries: TripListEntry[];
  nowISO: string;
  dateFormat: string;
  initialViewMode: "cards" | "list";
}

export function TravelHistoryPageClient({
  initialEntries,
  nowISO,
  dateFormat,
  initialViewMode,
}: TravelHistoryPageClientProps) {
  const now = new Date(nowISO);
  const handlers = useTravelHistoryPageHandlers(initialEntries, now);
  const editingTripId = handlers.editingEntry?.trip.id;

  return (
    <>
      <TravelHistoryList
        trips={handlers.pastTrips}
        dateFormat={dateFormat}
        initialViewMode={initialViewMode}
        onEditTrip={(trip) => handlers.setEditingTrip(trip.id)}
        onDeleteTrip={(trip) => handlers.setDeletingTrip(trip)}
      />
      <TripEditSheet
        key={handlers.editingTrip ?? "none"}
        trip={handlers.editingEntry?.trip ?? null}
        open={handlers.editingTrip !== null}
        onClose={handlers.closeTripEditSheet}
        onSave={async (patch) => {
          if (!handlers.editingTrip) return;
          await handlers.handleTripSave(handlers.editingTrip, patch);
        }}
        saving={handlers.savingTrip}
        dateFormat={dateFormat}
        dateChangeConfirmation={handlers.tripDateConfirmation}
        onResolveDateChange={async (resolution) => {
          await handlers.handleTripSaveResolution(resolution);
        }}
        onCancelDateChange={handlers.cancelTripDateChange}
        onDelete={editingTripId ? () => handlers.handleConfirmDeleteTrip(editingTripId) : undefined}
        isDeleting={handlers.isDeleting}
      />
      <DeleteTripAlertDialog
        tripName={handlers.deletingTrip?.name ?? ""}
        open={handlers.deletingTrip !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            handlers.setDeletingTrip(null);
          }
        }}
        onConfirm={() => handlers.handleConfirmDeleteTrip(handlers.deletingTrip?.id)}
        isDeleting={handlers.isDeleting}
      />
    </>
  );
}
