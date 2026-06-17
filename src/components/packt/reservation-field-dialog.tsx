"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export interface ReservationFieldDialogProps {
  title: string;
  value?: string;
  placeholder?: string;
  inputStyle?: React.CSSProperties;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (value?: string) => void;
}

export function ReservationFieldDialog({
  title,
  value,
  placeholder,
  inputStyle,
  open,
  onOpenChange,
  onSave,
}: ReservationFieldDialogProps) {
  const [draft, setDraft] = useState(value ?? "");

  // Sync draft from prop each time the dialog opens so stale state doesn't cause accidental clears
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setDraft(value ?? "");
  }, [open, value]);

  function handleSave() {
    onSave(draft.trim() || undefined);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => onOpenChange(isOpen as boolean)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Input
          placeholder={placeholder}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSave();
          }}
          style={inputStyle}
          autoFocus
        />
        <DialogFooter>
          {value && (
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
