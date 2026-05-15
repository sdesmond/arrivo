"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface TimePickerDropdownProps {
  time?: string;
  endTime?: string;
  onSave: (time?: string, endTime?: string) => void;
  onClose: () => void;
}

export function TimePickerDropdown({ time, endTime, onSave, onClose }: TimePickerDropdownProps) {
  const [draftTime, setDraftTime] = useState(time ?? "");
  const [draftEnd, setDraftEnd] = useState(endTime ?? "");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-50 rounded-[10px] p-4 flex flex-col gap-3"
      style={{
        top: "calc(100% + 4px)",
        left: 0,
        background: "var(--bg)",
        border: "1px solid var(--line-strong)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        minWidth: 260,
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--fg-4)", marginBottom: 4 }}>
            Start time
          </div>
          <Input type="time" value={draftTime} onChange={e => setDraftTime(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--fg-4)", marginBottom: 4 }}>
            End time
          </div>
          <Input type="time" value={draftEnd} onChange={e => setDraftEnd(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-between gap-2">
        {(time || endTime) && (
          <Button variant="ghost" size="sm" onClick={() => onSave(undefined, undefined)}>Remove</Button>
        )}
        <div className="flex gap-2 ml-auto">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onSave(draftTime || undefined, draftEnd || undefined)}>Save</Button>
        </div>
      </div>
    </div>
  );
}
