"use client";

import { DeleteTripAlertDialog } from "@/components/packt/delete-trip-alert-dialog";
import { TripsDesktopLayout } from "@/components/packt/trips-desktop-layout";
import { TripsMobileLayout } from "@/components/packt/trips-mobile-layout";
import { TripEditSheet } from "@/components/packt/trip-edit-sheet";
import { NewTripDialog } from "@/components/packt/new-trip-dialog";
import { type TripListEntry } from "@/data/types";
import { useTripsPageHandlers } from "./use-trips-page-handlers";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TripsPageClientProps {
  initialEntries: TripListEntry[];
  nowISO: string;
  dateFormat: string;
  initialViewMode: "cards" | "list";
}

export function TripsPageClient({ initialEntries, nowISO, dateFormat, initialViewMode }: TripsPageClientProps) {
  const now = new Date(nowISO);
  const handlers = useTripsPageHandlers(initialEntries, now);
  const editingTripId = handlers.editingEntry?.trip.id;

  return (
    <>
      <TripsDesktopLayout
        activeEntry={handlers.activeEntry}
        upcomingTrips={handlers.upcomingTrips}
        pastTrips={handlers.pastTrips}
        unscheduledEntries={handlers.unscheduledEntries}
        dateFormat={dateFormat}
        initialViewMode={initialViewMode}
        onNewTrip={() => handlers.setNewTripOpen(true)}
        onEditTrip={handlers.setEditingTrip}
        onDeleteTrip={(trip) => handlers.setDeletingTrip(trip)}
      />
      <TripsMobileLayout
        activeEntry={handlers.activeEntry}
        upcomingTrips={handlers.upcomingTrips}
        pastTrips={handlers.pastTrips}
        unscheduledEntries={handlers.unscheduledEntries}
        now={now}
        dateFormat={dateFormat}
        mobileTab={handlers.mobileTab}
        onTabChange={handlers.setMobileTab}
        onNewTrip={() => handlers.setNewTripOpen(true)}
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
      <NewTripDialog
        open={handlers.newTripOpen}
        onOpenChange={handlers.setNewTripOpen}
        onCreate={handlers.handleCreate}
        isPending={handlers.isCreating}
      />
      <AlertDialog open={handlers.pendingDraft !== null} onOpenChange={() => handlers.setPendingDraft(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Long trip</AlertDialogTitle>
            <AlertDialogDescription>
              This trip spans {handlers.pendingDraft?.dayCount} days. Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (handlers.pendingDraft) {
                  handlers.submitCreateTrip(handlers.pendingDraft.draft);
                  handlers.setPendingDraft(null);
                }
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
