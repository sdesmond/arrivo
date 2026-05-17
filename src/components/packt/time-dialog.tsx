"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
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
    <Dialog open={open} onOpenChange={(o) => onOpenChange(o as boolean)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Time</DialogTitle>
          {eventName && <p style={{ fontSize: 11, color: "var(--fg-4)", marginTop: -4 }}>{eventName}</p>}
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--fg-4)",
                marginBottom: 4,
              }}
            >
              Start time
            </div>
            <Input type="time" value={draftTime} onChange={(e) => setDraftTime(e.target.value)} />
          </div>
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--fg-4)",
                marginBottom: 4,
              }}
            >
              End time
            </div>
            <Input type="time" value={draftEnd} onChange={(e) => setDraftEnd(e.target.value)} />
          </div>
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
