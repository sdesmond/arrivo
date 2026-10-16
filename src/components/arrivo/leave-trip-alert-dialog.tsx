"use client";

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

export interface LeaveTripAlertDialogProps {
  tripName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  isLeaving?: boolean;
  error?: string | null;
}

const ACTION_TARGET_STYLE = { minHeight: 44, minWidth: 44 };

export function LeaveTripAlertDialog({
  tripName,
  open,
  onOpenChange,
  onConfirm,
  isLeaving = false,
  error = null,
}: LeaveTripAlertDialogProps) {
  function handleOpenChange(nextOpen: boolean): void {
    if (isLeaving && !nextOpen) return;
    onOpenChange(nextOpen);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent size="sm" aria-busy={isLeaving}>
        <AlertDialogHeader className="place-items-start text-left">
          <AlertDialogTitle>Leave {tripName}?</AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            You&apos;ll lose access to this trip and it will disappear from your trips list. Everyone else keeps the
            trip. A manager would need to invite you again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--destructive)" }}>
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost" disabled={isLeaving} style={ACTION_TARGET_STYLE}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isLeaving}
            style={ACTION_TARGET_STYLE}
            onClick={() => {
              void onConfirm();
            }}
          >
            {isLeaving ? "Leaving..." : "Leave trip"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
