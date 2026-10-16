"use client";

import type { ReactElement } from "react";
import { TripEditSheet } from "@/components/arrivo/trip-edit-sheet";
import { TripShareDialog } from "@/components/arrivo/trip-share-dialog";
import { LeaveTripAlertDialog } from "@/components/arrivo/leave-trip-alert-dialog";
import type {
  CurrencyOption,
  Expense,
  Trip,
  TripCurrencyChangeMode,
  TripDateChangeConfirmation,
  TripDateConflictResolution,
  UpdateTripPatch,
} from "@/data/types";
import type { useLeaveTrip } from "./use-leave-trip";

interface TripDetailDialogsProps {
  trip: Trip;
  currencyOptions: CurrencyOption[];
  expenses: Expense[];
  dateFormat: string;
  canManage: boolean;
  canEditBudget: boolean;
  editingTrip: boolean;
  highlightTripDates: boolean;
  onCloseEdit: () => void;
  onSaveTrip: (patch: UpdateTripPatch, currencyChangeMode?: TripCurrencyChangeMode) => Promise<void>;
  savingTrip: boolean;
  tripDateConfirmation: TripDateChangeConfirmation | null;
  onResolveDateChange: (resolution: TripDateConflictResolution) => Promise<void>;
  onCancelDateChange: () => void;
  onDeleteTrip: () => void | Promise<void>;
  isDeleting: boolean;
  sharingTrip: boolean;
  onSharingTripChange: (open: boolean) => void;
  leave: ReturnType<typeof useLeaveTrip>;
}

/** Trip-level dialogs: the edit sheet, plus Share for managers or Leave for everyone else. */
export function TripDetailDialogs({
  trip,
  currencyOptions,
  expenses,
  dateFormat,
  canManage,
  canEditBudget,
  editingTrip,
  highlightTripDates,
  onCloseEdit,
  onSaveTrip,
  savingTrip,
  tripDateConfirmation,
  onResolveDateChange,
  onCancelDateChange,
  onDeleteTrip,
  isDeleting,
  sharingTrip,
  onSharingTripChange,
  leave,
}: TripDetailDialogsProps): ReactElement {
  return (
    <>
      <TripEditSheet
        key={trip.id}
        trip={trip}
        currencyOptions={currencyOptions}
        expenses={expenses}
        open={editingTrip}
        onClose={onCloseEdit}
        highlightDates={highlightTripDates}
        onSave={onSaveTrip}
        saving={savingTrip}
        dateFormat={dateFormat}
        dateChangeConfirmation={tripDateConfirmation}
        onResolveDateChange={onResolveDateChange}
        onCancelDateChange={onCancelDateChange}
        canEditBudget={canEditBudget}
        onDelete={canManage ? onDeleteTrip : undefined}
        isDeleting={isDeleting}
      />
      {canManage ? <TripShareDialog open={sharingTrip} onOpenChange={onSharingTripChange} tripId={trip.id} /> : null}
      {canManage ? null : (
        <LeaveTripAlertDialog
          tripName={trip.name}
          open={leave.leaveDialogOpen}
          onOpenChange={leave.handleLeaveDialogOpenChange}
          onConfirm={leave.handleConfirmLeave}
          isLeaving={leave.isLeaving}
          error={leave.leaveError}
        />
      )}
    </>
  );
}
