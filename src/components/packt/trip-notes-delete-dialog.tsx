"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface TripNotesDeleteDialogProps {
  open: boolean;
  noteLabel: string;
  isDeleting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  onRetry?: () => void | Promise<void>;
}

export function TripNotesDeleteDialog({
  open,
  noteLabel,
  isDeleting,
  error,
  onOpenChange,
  onConfirm,
  onRetry,
}: TripNotesDeleteDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isDeleting) statusRef.current?.focus();
  }, [isDeleting]);

  useEffect(() => {
    if (!error) return;
    toast.error(error);
    const focusRetry = window.setTimeout(() => retryButtonRef.current?.focus(), 0);
    return () => window.clearTimeout(focusRetry);
  }, [error]);

  function handleOpenChange(nextOpen: boolean): void {
    if (!isDeleting) onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        initialFocus={cancelButtonRef}
        aria-busy={isDeleting}
        aria-describedby={error ? "trip-note-delete-error" : undefined}
      >
        <DialogHeader>
          <DialogTitle>Delete {noteLabel}?</DialogTitle>
        </DialogHeader>
        <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--fg-2)" }}>
          This note will be permanently removed. This cannot be undone.
        </p>
        <div ref={statusRef} role="status" tabIndex={-1}>
          {isDeleting ? "Deleting note" : ""}
        </div>
        {error ? (
          <div className="flex items-center justify-between gap-2">
            <p
              id="trip-note-delete-error"
              role="alert"
              aria-live="polite"
              style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--destructive)" }}
            >
              {error}
            </p>
            <Button
              ref={retryButtonRef}
              type="button"
              variant="outline"
              onClick={() => void (onRetry ?? onConfirm)()}
              disabled={isDeleting}
              style={{ minHeight: 44, minWidth: 44 }}
            >
              Retry
            </Button>
          </div>
        ) : null}
        <DialogFooter>
          <Button
            ref={cancelButtonRef}
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
            style={{ minHeight: 44, minWidth: 44 }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void onConfirm()}
            disabled={isDeleting}
            style={{ minHeight: 44, minWidth: 44 }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
