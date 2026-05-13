"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

export interface CostDialogProps {
  cost?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (cost?: number) => void;
}

export function CostDialog({ cost, open, onOpenChange, onSave }: CostDialogProps) {
  const [draft, setDraft] = useState(cost !== undefined ? String(cost) : "");

  function handleSave() {
    const num = parseFloat(draft);
    onSave(isNaN(num) ? undefined : num);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => onOpenChange(o as boolean)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Cost</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 18, fontWeight: 500, color: "var(--fg-3)" }}>$</span>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
            autoFocus
          />
        </div>
        <DialogFooter>
          {cost !== undefined && (
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
