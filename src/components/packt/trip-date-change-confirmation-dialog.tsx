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
  type TripDateConflictResolution as TripDateConflictResolutionValue,
} from "@/data/types";
import { formatDate } from "@/lib/utils";

interface TripDateChangeConfirmationDialogProps {
  dateChangeConfirmation: TripDateChangeConfirmation | null;
  dateFormat: string;
  saving?: boolean;
  onResolveDateChange?: (resolution: TripDateConflictResolutionValue) => void | Promise<void>;
  onCancelDateChange?: () => void;
}

export function TripDateChangeConfirmationDialog({
  dateChangeConfirmation,
  dateFormat,
  saving = false,
  onResolveDateChange,
  onCancelDateChange,
}: TripDateChangeConfirmationDialogProps) {
  function formatRemovedDates(removedDates: string[]): string {
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
            Your new trip dates will remove events (along with their notes and documents) you had planned for{" "}
            <strong className="font-semibold text-foreground">
              {formatRemovedDates(dateChangeConfirmation?.removedDates ?? [])}
            </strong>
            . Do you want to move those events to unscheduled or just remove them entirely?
          </AlertDialogDescription>
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
            Remove Events
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
