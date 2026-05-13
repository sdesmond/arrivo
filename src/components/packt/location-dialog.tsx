"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

export interface LocationDialogProps {
  address?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (address?: string) => void;
}

export function LocationDialog({ address, open, onOpenChange, onSave }: LocationDialogProps) {
  const [draft, setDraft] = useState(address ?? "");

  function handleSave() {
    onSave(draft.trim() || undefined);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => onOpenChange(o as boolean)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Location</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Enter address or place name"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
          autoFocus
        />
        <DialogFooter>
          {address && (
            <Button variant="ghost" onClick={() => { onSave(undefined); onOpenChange(false); }}>
              Remove
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
