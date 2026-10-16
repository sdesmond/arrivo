"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface CoverAttributionDialogProps {
  photographer: string;
  photographerUrl?: string;
  open: boolean;
  onClose: () => void;
}

export function CoverAttributionDialog({ photographer, photographerUrl, open, onClose }: CoverAttributionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => (!isOpen ? onClose() : undefined)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{photographer}</DialogTitle>
          <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--fg-3)" }}>
            Photo by {photographer} on Unsplash.
          </p>
        </DialogHeader>
        {photographerUrl ? (
          <a
            href={photographerUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--accent-brand)",
              fontSize: "calc(13px * var(--font-scale))",
              textDecoration: "underline",
            }}
          >
            View on Unsplash
          </a>
        ) : null}
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
