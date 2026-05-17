"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export interface LocationDialogProps {
  address?: string;
  eventName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (address?: string) => void;
}

export function LocationDialog({ address, eventName, open, onOpenChange, onSave }: LocationDialogProps) {
  const [draft, setDraft] = useState(address ?? "");

  // Sync draft from prop each time the dialog opens so stale state doesn't cause accidental clears

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setDraft(address ?? "");
  }, [open, address]);

  function handleSave() {
    onSave(draft.trim() || undefined);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => onOpenChange(o as boolean)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Location</DialogTitle>
          {eventName && <p style={{ fontSize: 11, color: "var(--fg-4)", marginTop: -4 }}>{eventName}</p>}
        </DialogHeader>
        <Input
          placeholder="Enter address or place name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
          autoFocus
        />
        <DialogFooter>
          {address && (
            <Button
              variant="ghost"
              className="sm:mr-auto"
              onClick={() => {
                onSave(undefined);
                onOpenChange(false);
              }}
            >
              Remove
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
