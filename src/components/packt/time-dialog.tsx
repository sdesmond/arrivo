"use client";

import { useState, useEffect } from "react";
import { TimePicker } from "@/components/ui/time-picker";
import { Field } from "@/components/packt/form-section";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export interface TimeDialogProps {
  time?: string;
  endTime?: string;
  eventName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (time?: string, endTime?: string) => void;
}

export function TimeDialog({ time, endTime, eventName, open, onOpenChange, onSave }: TimeDialogProps) {
  const [draftTime, setDraftTime] = useState(time ?? "");
  const [draftEnd, setDraftEnd] = useState(endTime ?? "");

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (open) {
      setDraftTime(time ?? "");
      setDraftEnd(endTime ?? "");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, time, endTime]);

  function handleSave() {
    onSave(draftTime || undefined, draftEnd || undefined);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => onOpenChange(isOpen as boolean)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Time</DialogTitle>
          {eventName && (
            <p style={{ fontSize: "calc(11px * var(--font-scale))", color: "var(--fg-4)", marginTop: -4 }}>
              {eventName}
            </p>
          )}
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start time">
            <TimePicker value={draftTime || undefined} onChange={(value) => setDraftTime(value ?? "")} />
          </Field>
          <Field label="End time">
            <TimePicker value={draftEnd || undefined} onChange={(value) => setDraftEnd(value ?? "")} />
          </Field>
        </div>
        <DialogFooter>
          {(time || endTime) && (
            <Button
              variant="ghost"
              className="sm:mr-auto"
              onClick={() => {
                onSave(undefined, undefined);
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
