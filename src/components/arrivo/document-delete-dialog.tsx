"use client";

import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface DocumentDeleteDialogProps {
  name: string;
  open: boolean;
  isPending: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  finalFocusRef?: React.RefObject<HTMLButtonElement | null>;
}

export function DocumentDeleteDialog({
  name,
  open,
  isPending,
  error,
  onOpenChange,
  onConfirm,
  finalFocusRef,
}: DocumentDeleteDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} initialFocus={cancelRef} finalFocus={finalFocusRef}>
        <DialogHeader>
          <DialogTitle>{`Delete ${name}?`}</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--destructive)" }}>
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            ref={cancelRef}
            className="h-11"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button className="h-11" onClick={onConfirm} disabled={isPending}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
