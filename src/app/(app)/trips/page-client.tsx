"use client";

import { useEffect, useMemo, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { DeleteTripAlertDialog } from "@/components/packt/delete-trip-alert-dialog";
import { TripsDesktopLayout } from "@/components/packt/trips-desktop-layout";
import { TripsMobileLayout } from "@/components/packt/trips-mobile-layout";
import { TripEditSheet } from "@/components/packt/trip-edit-sheet";
import { NewTripDialog } from "@/components/packt/new-trip-dialog";
import { type TripListEntry } from "@/data/types";
import { useOfflineDb, mirrorTripListEntries, readTripListFromMirror } from "@/lib/offline/db";
import { useOnlineStatus } from "@/lib/offline/use-online-status";
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
  const now = useMemo(() => new Date(nowISO), [nowISO]);
  const database = useOfflineDb();
  const isOnline = useOnlineStatus();
  const mirrorInFlight = useRef(false);

  useEffect(() => {
    if (!database || !isOnline) return;
    if (mirrorInFlight.current) return;
    mirrorInFlight.current = true;
    void mirrorTripListEntries(database, initialEntries).finally(() => {
      mirrorInFlight.current = false;
    });
  }, [database, isOnline, initialEntries]);

  const offlineEntries = useLiveQuery(
    () => (isOnline || !database ? undefined : readTripListFromMirror(database, now)),
    [isOnline, database, nowISO]
  );

  const effectiveEntries = !isOnline && offlineEntries ? offlineEntries : initialEntries;

  const handlers = useTripsPageHandlers(effectiveEntries, now);
  const editingTripId = handlers.editingEntry?.trip.id;

  return (
    <>
      <TripsDesktopLayout
        activeEntry={handlers.activeEntry}
        upcomingTrips={handlers.upcomingTrips}
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
        unscheduledEntries={handlers.unscheduledEntries}
        now={now}
        dateFormat={dateFormat}
        mobileTab={handlers.mobileTab}
        onTabChange={handlers.setMobileTab}
        onNewTrip={() => handlers.setNewTripOpen(true)}
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
