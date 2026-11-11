"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { deleteEvent } from "@/lib/api/contract/events";
import { pluralize } from "@/lib/utils";

export interface DeleteEventDialogProps {
  eventId: string;
  tripId: string;
  eventName: string;
  docCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteEventDialog({
  eventId,
  tripId,
  eventName,
  docCount,
  open,
  onOpenChange,
}: DeleteEventDialogProps) {
  const { mutate, isPending } = useApiMutation(deleteEvent);

  // The hook toasts a failure, so the dialog just stays open for another try; a success closes it.
  function runDecision(keepDocuments: boolean) {
    void mutate({ params: { eventId }, body: { tripId, keepDocuments } }, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {eventName}?</DialogTitle>
        </DialogHeader>
        <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--fg-2)" }}>
          This event has {docCount} attached {pluralize(docCount, "document")}. What would you like to do with{" "}
          {docCount === 1 ? "it" : "them"}?
        </p>
        <DialogFooter className="sm:flex-wrap">
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
