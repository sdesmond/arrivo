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
}

export function TripsPageClient({ initialEntries, nowISO, dateFormat }: TripsPageClientProps) {
  const now = new Date(nowISO);
  const h = useTripsPageHandlers(initialEntries, now);
  const editingTripId = h.editingEntry?.trip.id;

  return (
    <>
      <TripsDesktopLayout
        activeEntry={h.activeEntry}
        upcomingTrips={h.upcomingTrips}
        pastTrips={h.pastTrips}
        unscheduledEntries={h.unscheduledEntries}
        now={now}
        dateFormat={dateFormat}
        nextInDays={h.nextInDays}
        onNewTrip={() => h.setNewTripOpen(true)}
        onEditTrip={h.setEditingTrip}
        onDeleteTrip={(trip) => h.setDeletingTrip(trip)}
      />
      <TripsMobileLayout
        activeEntry={h.activeEntry}
        upcomingTrips={h.upcomingTrips}
        pastTrips={h.pastTrips}
        unscheduledEntries={h.unscheduledEntries}
        now={now}
        dateFormat={dateFormat}
        mobileTab={h.mobileTab}
        onTabChange={h.setMobileTab}
        onNewTrip={() => h.setNewTripOpen(true)}
        onEditTrip={(trip) => h.setEditingTrip(trip.id)}
        onDeleteTrip={(trip) => h.setDeletingTrip(trip)}
      />
      <TripEditSheet
        key={h.editingTrip ?? "none"}
        trip={h.editingEntry?.trip ?? null}
        open={h.editingTrip !== null}
        onClose={h.closeTripEditSheet}
        onSave={async (patch) => {
          if (!h.editingTrip) return;
          await h.handleTripSave(h.editingTrip, patch);
        }}
        saving={h.savingTrip}
        dateFormat={dateFormat}
        dateChangeConfirmation={h.tripDateConfirmation}
        onResolveDateChange={async (resolution) => {
          await h.handleTripSaveResolution(resolution);
        }}
        onCancelDateChange={h.cancelTripDateChange}
        onDelete={editingTripId ? () => h.handleConfirmDeleteTrip(editingTripId) : undefined}
        isDeleting={h.isDeleting}
      />
      <DeleteTripAlertDialog
        tripName={h.deletingTrip?.name ?? ""}
        open={h.deletingTrip !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            h.setDeletingTrip(null);
          }
        }}
        onConfirm={() => h.handleConfirmDeleteTrip(h.deletingTrip?.id)}
        isDeleting={h.isDeleting}
      />
      <NewTripDialog
        open={h.newTripOpen}
        onOpenChange={h.setNewTripOpen}
        onCreate={h.handleCreate}
        isPending={h.isCreating}
      />
      <AlertDialog open={h.pendingDraft !== null} onOpenChange={() => h.setPendingDraft(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Long trip</AlertDialogTitle>
            <AlertDialogDescription>
              This trip spans {h.pendingDraft?.dayCount} days. Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (h.pendingDraft) {
                  h.submitCreateTrip(h.pendingDraft.draft);
                  h.setPendingDraft(null);
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
