"use client";

import { useState, useRef, useEffect } from "react";
import {
  Check, MapPin, Train, ChevronDown,
  FileText, Clock, DollarSign, Pencil, Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { type TripEvent, type Document } from "@/data/types";
import { isEventNow, isEventPast } from "@/lib/utils";

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

function DocKindBadge({ kind }: { kind: Document["kind"] }) {
  const map = {
    pdf:   { label: "PDF",  color: "oklch(0.72 0.12 25)"  },
    image: { label: "IMG",  color: "oklch(0.72 0.10 145)" },
    doc:   { label: "DOC",  color: "oklch(0.70 0.10 250)" },
    link:  { label: "LINK", color: "oklch(0.70 0.08 200)" },
  } as const;
  const { label, color } = map[kind] ?? { label: "FILE", color: "oklch(0.70 0.04 250)" };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 shrink-0"
      style={{
        fontFamily: "var(--font-mono-family, ui-monospace)",
        fontSize: 9, fontWeight: 600, letterSpacing: "0.06em",
        color,
        background: "var(--surface-2)",
        border: `1px solid ${color}44`,
      }}
    >
      <FileText size={10} strokeWidth={1.5} style={{ color }} />
      {label}
    </span>
  );
}

function DocsBlock({ docs }: { docs: Document[] }) {
  return (
    <div className="mt-2" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
      <div
        style={{
          fontFamily: "var(--font-mono-family, ui-monospace)",
          fontSize: "9.5px", fontWeight: 600,
          letterSpacing: "0.08em", textTransform: "uppercase",
          color: "var(--fg-4)", marginBottom: 6,
        }}
      >
        DOCS
      </div>
      <div className="flex flex-col gap-1.5">
        {docs.map((d) => (
          <button
            key={d.id}
            className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-left transition-colors hover:bg-surface-2 w-full"
            style={{ background: "var(--surface)" }}
          >
            <DocKindBadge kind={d.kind} />
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--fg)", lineHeight: 1.2 }} className="truncate">
                {d.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--fg-4)" }}>{d.size}</div>
            </div>
            {d.offline ? (
              <span
                className="shrink-0 flex items-center gap-0.5 rounded-full px-1.5 py-0.5"
                style={{ fontSize: 10, color: "var(--accent-ink)", background: "var(--accent-soft)" }}
              >
                <Check size={9} strokeWidth={2} /> Offline
              </span>
            ) : (
              <span style={{ fontSize: 11, color: "var(--fg-4)" }}>↓</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function TimePickerDropdown({
  time, endTime, onSave, onClose,
}: {
  time?: string;
  endTime?: string;
  onSave: (time?: string, endTime?: string) => void;
  onClose: () => void;
}) {
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
        <Button variant="ghost" size="sm" onClick={() => onSave(undefined, undefined)}>Clear</Button>
        <Button size="sm" onClick={() => onSave(draftTime || undefined, draftEnd || undefined)}>Save</Button>
      </div>
    </div>
  );
}

function CostDialog({
  cost, open, onOpenChange, onSave,
}: {
  cost?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (cost?: number) => void;
}) {
  const [draft, setDraft] = useState(cost !== undefined ? String(cost) : "");

  useEffect(() => {
    if (open) setDraft(cost !== undefined ? String(cost) : "");
  }, [open, cost]);

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

function LocationDialog({
  address, open, onOpenChange, onSave,
}: {
  address?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (address?: string) => void;
}) {
  const [draft, setDraft] = useState(address ?? "");

  useEffect(() => {
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

interface PlaceRowProps {
  place: TripEvent;
  isLast?: boolean;
  onUpdate: (event: TripEvent) => void;
  onDelete: (id: string) => void;
}

export function PlaceRow({ place: p, isLast, onUpdate, onDelete }: PlaceRowProps) {
  const [showDocs, setShowDocs] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(p.name);

  const [isEditingNote, setIsEditingNote] = useState(false);
  const [draftNote, setDraftNote] = useState(p.note ?? "");

  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showCostDialog, setShowCostDialog] = useState(false);
  const [showLocationDialog, setShowLocationDialog] = useState(false);

  const hasDocs = (p.docs?.length ?? 0) > 0;
  const isPast = isEventPast(p);
  const isNow = isEventNow(p);

  function saveName() {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== p.name) onUpdate({ ...p, name: trimmed });
    else setDraftName(p.name);
    setIsEditingName(false);
  }

  function saveNote() {
    const val = draftNote.trim() || undefined;
    if (val !== p.note) onUpdate({ ...p, note: val });
    setIsEditingNote(false);
  }

  const timeLabel = p.time
    ? p.endTime
      ? `${formatTime(p.time)} – ${formatTime(p.endTime)}`
      : formatTime(p.time)
    : null;

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className="flex items-start gap-3 rounded-[8px] px-3 py-2.5"
        style={{
          opacity: isPast ? 0.7 : 1,
          background: isNow ? "var(--accent-soft)" : undefined,
          border: isNow ? "1px solid var(--accent-brand)" : "1px solid transparent",
        }}
      >
        {/* Time column */}
        <div
          style={{
            fontFamily: "var(--font-mono-family, ui-monospace)",
            fontSize: 11, fontWeight: 500,
            color: isNow ? "var(--accent-brand)" : "var(--fg-3)",
            width: 56, flexShrink: 0, paddingTop: 1, lineHeight: 1.4,
            letterSpacing: "0.02em",
          }}
        >
          {p.time && formatTime(p.time)}
          {p.endTime && (
            <div style={{ fontSize: 10, color: "var(--fg-4)" }}>–{formatTime(p.endTime)}</div>
          )}
          {isNow && (
            <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent-brand)", marginTop: 1 }}>
              NOW
            </div>
          )}
        </div>

        {/* Timeline dot */}
        <div className="flex flex-col items-center shrink-0 pt-1" style={{ width: 16 }}>
          <div
            className="rounded-full flex items-center justify-center shrink-0"
            style={{
              width: 16, height: 16,
              background: isPast || isNow ? "var(--accent-brand)" : "var(--surface-2)",
              border: isPast || isNow ? "none" : "1.5px solid var(--line-strong)",
              color: isPast || isNow ? "#fff" : "var(--fg-4)",
            }}
          >
            {isPast ? (
              <Check size={9} strokeWidth={2.5} />
            ) : isNow ? (
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff", display: "block" }} />
            ) : (
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "currentColor", display: "block", opacity: 0.5 }} />
            )}
          </div>
          {!isLast && (
            <div style={{ width: 1, flex: 1, minHeight: 12, background: "var(--line)", marginTop: 2 }} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Name row */}
          <div className="flex items-center gap-1.5 min-w-0">
            {isEditingName ? (
              <input
                autoFocus
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                onBlur={saveName}
                onKeyDown={e => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") { setDraftName(p.name); setIsEditingName(false); }
                }}
                style={{
                  fontSize: 14, fontWeight: 600, color: "var(--fg)",
                  background: "var(--surface-2)",
                  border: "1px solid var(--accent-brand)",
                  borderRadius: 4, padding: "1px 6px",
                  outline: "none", width: "100%",
                  fontFamily: "inherit",
                }}
              />
            ) : (
              <>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)", lineHeight: 1.2 }}>
                  {p.name}
                </span>
                <button
                  onClick={() => { setDraftName(p.name); setIsEditingName(true); }}
                  style={{
                    color: "var(--fg-4)",
                    opacity: isHovered ? 1 : 0,
                    transition: "opacity 0.1s",
                    display: "flex", alignItems: "center",
                    padding: 2, borderRadius: 3,
                    background: "none", border: "none", cursor: "pointer",
                    flexShrink: 0,
                  }}
                  title="Edit name"
                >
                  <Pencil size={11} strokeWidth={1.5} />
                </button>
              </>
            )}
          </div>

          {/* Note area */}
          <div className="mt-1.5">
            {isEditingNote ? (
              <textarea
                autoFocus
                value={draftNote}
                onChange={e => setDraftNote(e.target.value)}
                onBlur={saveNote}
                onKeyDown={e => {
                  if (e.key === "Escape") { setDraftNote(p.note ?? ""); setIsEditingNote(false); }
                }}
                rows={2}
                style={{
                  width: "100%", fontSize: 12, color: "var(--fg-2)",
                  background: "var(--surface-2)",
                  border: "1px solid var(--accent-brand)",
                  borderLeft: "2px solid var(--accent-brand)",
                  borderRadius: 6, padding: "6px 10px",
                  outline: "none", resize: "vertical",
                  fontFamily: "inherit", lineHeight: 1.5,
                }}
              />
            ) : (
              <div
                onClick={() => { setDraftNote(p.note ?? ""); setIsEditingNote(true); }}
                style={{
                  fontSize: 12,
                  cursor: "text",
                  borderRadius: 6, padding: "4px 10px",
                  lineHeight: 1.5,
                  ...(p.note
                    ? {
                        color: "var(--fg-2)",
                        background: "var(--surface-2)",
                        borderLeft: "2px solid var(--accent-brand)",
                      }
                    : {
                        color: "var(--fg-4)",
                      }),
                }}
              >
                {p.note ?? "Add a note…"}
              </div>
            )}
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-1 flex-wrap mt-2">
            {/* Time */}
            <div className="relative">
              <button
                onClick={() => setShowTimePicker(v => !v)}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
                style={{
                  fontSize: 11,
                  color: p.time ? "var(--fg-2)" : "var(--fg-4)",
                  background: p.time ? "var(--surface-2)" : "none",
                  border: p.time ? "1px solid var(--line)" : "1px solid transparent",
                }}
              >
                <Clock size={11} strokeWidth={1.5} />
                {timeLabel ?? "Add time"}
              </button>
              {showTimePicker && (
                <TimePickerDropdown
                  time={p.time}
                  endTime={p.endTime}
                  onSave={(t, et) => {
                    onUpdate({ ...p, time: t, endTime: et });
                    setShowTimePicker(false);
                  }}
                  onClose={() => setShowTimePicker(false)}
                />
              )}
            </div>

            {/* Location */}
            <button
              onClick={() => setShowLocationDialog(true)}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
              style={{
                fontSize: 11,
                color: p.location?.address ? "var(--fg-2)" : "var(--fg-4)",
                background: p.location?.address ? "var(--surface-2)" : "none",
                border: p.location?.address ? "1px solid var(--line)" : "1px solid transparent",
                maxWidth: 160,
              }}
            >
              <MapPin size={11} strokeWidth={1.5} style={{ flexShrink: 0 }} />
              <span className="truncate">{p.location?.address ?? "Add location"}</span>
            </button>

            {/* Cost */}
            <button
              onClick={() => setShowCostDialog(true)}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
              style={{
                fontSize: 11,
                color: p.cost !== undefined ? "var(--fg-2)" : "var(--fg-4)",
                background: p.cost !== undefined ? "var(--surface-2)" : "none",
                border: p.cost !== undefined ? "1px solid var(--line)" : "1px solid transparent",
              }}
            >
              <DollarSign size={11} strokeWidth={1.5} />
              {p.cost !== undefined ? p.cost.toFixed(2) : "Add cost"}
            </button>

            {/* Docs toggle */}
            {hasDocs && (
              <button
                onClick={() => setShowDocs(v => !v)}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
                style={{
                  fontSize: 11,
                  color: "var(--fg-4)",
                  border: "1px solid transparent",
                }}
              >
                <FileText size={11} strokeWidth={1.5} />
                {p.docs!.length} doc{p.docs!.length !== 1 ? "s" : ""}
                <ChevronDown
                  size={10}
                  style={{
                    transform: showDocs ? "rotate(180deg)" : undefined,
                    transition: "transform 0.15s",
                  }}
                />
              </button>
            )}
          </div>

          {showDocs && hasDocs && <DocsBlock docs={p.docs!} />}
        </div>

        {/* Trash icon — hover only */}
        <button
          onClick={() => onDelete(p.id)}
          style={{
            opacity: isHovered ? 1 : 0,
            transition: "opacity 0.1s",
            color: "var(--fg-4)",
            padding: 4, borderRadius: 4,
            background: "none", border: "none", cursor: "pointer",
            flexShrink: 0,
            display: "flex", alignItems: "center",
          }}
          title="Delete event"
        >
          <Trash2 size={13} strokeWidth={1.5} />
        </button>
      </div>

      {/* Travel connector */}
      {p.travelTo && !isLast && (
        <div
          className="flex items-center gap-2 pl-[88px] py-1"
          style={{ fontSize: 12, color: "var(--fg-3)" }}
        >
          <Train size={12} strokeWidth={1.5} />
          {p.travelTo.mode} · {p.travelTo.detail}
        </div>
      )}

      <CostDialog
        cost={p.cost}
        open={showCostDialog}
        onOpenChange={setShowCostDialog}
        onSave={cost => onUpdate({ ...p, cost })}
      />
      <LocationDialog
        address={p.location?.address}
        open={showLocationDialog}
        onOpenChange={setShowLocationDialog}
        onSave={address => onUpdate({ ...p, location: { ...p.location, address } })}
      />
    </div>
  );
}
