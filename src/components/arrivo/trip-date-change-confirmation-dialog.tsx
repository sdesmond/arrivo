"use client";

import { Button } from "@/components/ui/button";
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
import {
  TripDateConflictResolution,
  type TripDateChangeConfirmation,
  type TripDateChangePreviewReservation,
  type TripDateConflictResolution as TripDateConflictResolutionValue,
} from "@/data/types";
import { RESERVATION_TYPE_META } from "@/components/arrivo/reservation-type-badge";
import { formatDate } from "@/lib/utils";

interface TripDateChangeConfirmationDialogProps {
  dateChangeConfirmation: TripDateChangeConfirmation | null;
  dateFormat: string;
  saving?: boolean;
  onResolveDateChange?: (resolution: TripDateConflictResolutionValue) => void | Promise<void>;
  onCancelDateChange?: () => void;
}

function formatReservationName(reservation: TripDateChangePreviewReservation): string {
  const typeLabel = RESERVATION_TYPE_META[reservation.type]?.label ?? reservation.type;
  const provider = reservation.provider.trim();
  return provider ? `${provider} (${typeLabel})` : typeLabel;
}

export function TripDateChangeConfirmationDialog({
  dateChangeConfirmation,
  dateFormat,
  saving = false,
  onResolveDateChange,
  onCancelDateChange,
}: TripDateChangeConfirmationDialogProps) {
  function formatRemovedLabels(removedDayLabels: string[]): string {
    if (removedDayLabels.length === 0) return "";
    if (removedDayLabels.length === 1) return removedDayLabels[0];

    const dayNumbers = removedDayLabels.map((label) => {
      const match = /^Day (\d+)$/.exec(label);
      return match ? Number(match[1]) : null;
    });

    const hasContiguousDayNumbers = dayNumbers.every((dayNumber, index) => {
      if (dayNumber === null) return false;
      if (index === 0) return true;
      return dayNumber === (dayNumbers[index - 1] ?? 0) + 1;
    });

    if (hasContiguousDayNumbers) {
      return `${removedDayLabels[0]} - ${removedDayLabels[removedDayLabels.length - 1]}`;
    }

    return removedDayLabels.join(", ");
  }

  function formatRemovedDates(removedDates: string[], removedDayLabels?: string[]): string {
    if (removedDayLabels && removedDayLabels.length > 0) {
      return formatRemovedLabels(removedDayLabels);
    }
    if (removedDates.length === 0) return "";
    if (removedDates.length === 1) return formatDate(removedDates[0], dateFormat);

    const isContiguous = removedDates.every((date, index) => {
      if (index === 0) return true;

      const current = new Date(date + "T00:00:00");
      const previous = new Date(removedDates[index - 1] + "T00:00:00");
      return current.getTime() - previous.getTime() === 86_400_000;
    });

    if (isContiguous) {
      return `${formatDate(removedDates[0], dateFormat)} - ${formatDate(
        removedDates[removedDates.length - 1],
        dateFormat
      )}`;
    }

    return removedDates.map((date) => formatDate(date, dateFormat)).join(", ");
  }

  async function handleResolution(resolution: TripDateConflictResolutionValue): Promise<void> {
    await onResolveDateChange?.(resolution);
  }

  const affectedReservations = dateChangeConfirmation?.reservations ?? [];
  const hasReservations = affectedReservations.length > 0;
  const affectsOnlyReservations =
    hasReservations &&
    (dateChangeConfirmation?.events.length ?? 0) === 0 &&
    (dateChangeConfirmation?.noteCount ?? 0) === 0 &&
    (dateChangeConfirmation?.checklistCount ?? 0) === 0;
  const removedDatesLabel = formatRemovedDates(
    dateChangeConfirmation?.removedDates ?? [],
    dateChangeConfirmation?.removedDayLabels
  );

  return (
    <AlertDialog
      open={dateChangeConfirmation !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onCancelDateChange?.();
        }
      }}
    >
      <AlertDialogContent size="default" className="sm:max-w-md">
        <AlertDialogHeader className="place-items-start text-left">
          <AlertDialogTitle>Confirm Date Change</AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            {affectsOnlyReservations ? (
              <>Your new trip dates will remove reservations you had booked for </>
            ) : (
              <>Your new trip dates will remove events (along with their notes and documents) you had planned for </>
            )}
            <strong className="font-semibold text-foreground">{removedDatesLabel}</strong>
            {affectsOnlyReservations
              ? ". Do you want to keep them in the Reservations tab or remove them entirely?"
              : ". Do you want to move those events to unscheduled or just remove them entirely?"}
          </AlertDialogDescription>
          {hasReservations && (
            <div className="text-left text-sm text-muted-foreground">
              <p>
                Reservations on removed dates will leave the itinerary. Keeping them lets them stay in the Reservations
                tab; removing them deletes them:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {affectedReservations.map((reservation) => (
                  <li key={reservation.id}>
                    {formatReservationName(reservation)} — {formatDate(reservation.date, dateFormat)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </AlertDialogHeader>

        <AlertDialogFooter className="grid-cols-1 gap-2 sm:flex sm:flex-row sm:flex-nowrap sm:items-center sm:justify-between">
          <AlertDialogAction
            variant="ghost"
            className="justify-center text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:border-destructive/40 focus-visible:ring-destructive/20"
            disabled={saving}
            onClick={() => {
              void handleResolution(TripDateConflictResolution.DeleteEvents);
            }}
          >
            {hasReservations ? "Remove All" : "Remove Events"}
          </AlertDialogAction>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <AlertDialogCancel variant="ghost" disabled={saving} onClick={onCancelDateChange}>
              Cancel
            </AlertDialogCancel>
            <Button
              disabled={saving}
              onClick={() => {
                void handleResolution(TripDateConflictResolution.KeepAsUnscheduled);
              }}
            >
              Keep Events
            </Button>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
