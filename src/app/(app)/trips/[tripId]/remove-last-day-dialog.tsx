"use client";

import type { ReactElement } from "react";
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

interface RemoveLastDayDialogProps {
  open: boolean;
  removingDay: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirms removing a final day that still has planned content. */
export function RemoveLastDayDialog({
  open,
  removingDay,
  onCancel,
  onConfirm,
}: RemoveLastDayDialogProps): ReactElement {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel();
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Day</AlertDialogTitle>
          <AlertDialogDescription>Planned content will be deleted from this day.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={removingDay}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={removingDay} onClick={onConfirm}>
            {removingDay ? "Removing Day..." : "Remove Day"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
