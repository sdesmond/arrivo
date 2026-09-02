"use client";

import { DeleteTripAlertDialog } from "@/components/packt/delete-trip-alert-dialog";
import { PendingInvitationsList } from "@/components/packt/pending-invitations-list";
import { TripsDesktopLayout } from "@/components/packt/trips-desktop-layout";
import { TripsMobileLayout } from "@/components/packt/trips-mobile-layout";
import { TripEditSheet } from "@/components/packt/trip-edit-sheet";
import { NewTripDialog } from "@/components/packt/new-trip-dialog";
import { CollaboratorRole, type CurrencyOption, type PendingInvitation, type TripListEntry } from "@/data/types";
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
  currencyOptions?: CurrencyOption[];
  nowISO: string;
  dateFormat: string;
  initialViewMode: "cards" | "list";
  pendingInvitations?: PendingInvitation[];
}

export function TripsPageClient({
  initialEntries,
  currencyOptions = [],
  nowISO,
  dateFormat,
  initialViewMode,
  pendingInvitations = [],
}: TripsPageClientProps) {
  const now = new Date(nowISO);
  const handlers = useTripsPageHandlers(initialEntries, now);
  const editingTripId = handlers.editingEntry?.trip.id;
  const editingCanManage = handlers.editingEntry?.trip.accessRole === CollaboratorRole.Manager;
  const editingCanEditBudget = handlers.editingEntry?.trip.accessRole !== CollaboratorRole.Viewer;

  return (
    <>
      <PendingInvitationsList invitations={pendingInvitations} />
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
        currencyOptions={currencyOptions}
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
        canManage={editingCanManage}
        canEditBudget={editingCanEditBudget}
        onDelete={editingTripId && editingCanManage ? () => handlers.handleConfirmDeleteTrip(editingTripId) : undefined}
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
