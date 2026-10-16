"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteEventWithDocDecision } from "@/app/(app)/trips/[tripId]/actions";
import { pluralize } from "@/lib/utils";

export interface DeleteEventDialogProps {
  eventId: string;
  eventName: string;
  docCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteEventDialog({ eventId, eventName, docCount, open, onOpenChange }: DeleteEventDialogProps) {
  const [isPending, startTransition] = useTransition();

  function runDecision(keepDocs: boolean) {
    startTransition(async () => {
      try {
        await deleteEventWithDocDecision(eventId, keepDocs);
        onOpenChange(false);
      } catch (err) {
        console.error("deleteEventWithDocDecision failed", err);
        toast.error("Failed to delete event. Please try again.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete {eventName}?</DialogTitle>
        </DialogHeader>
        <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--fg-2)" }}>
          This event has {docCount} attached {pluralize(docCount, "document")}. What would you like to do with{" "}
          {docCount === 1 ? "it" : "them"}?
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending} style={{ minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => runDecision(false)}
            disabled={isPending}
            style={{ minHeight: 44 }}
          >
            Delete everything
          </Button>
          <Button autoFocus onClick={() => runDecision(true)} disabled={isPending} style={{ minHeight: 44 }}>
            Keep documents
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
