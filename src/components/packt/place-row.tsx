"use client";

import { useState } from "react";
import { MapPin, ChevronDown, FileText, Clock, DollarSign, Pencil, Trash2, Paperclip } from "lucide-react";
import { type TripEvent } from "@/data/types";
import { isEventNow } from "@/lib/utils";
import { useNow } from "@/components/providers/mock-date-provider";
import { DocsBlock } from "./docs-block";
import { TimePickerDropdown } from "./time-picker-dropdown";
import { CostDialog } from "./cost-dialog";
import { LocationDialog } from "./location-dialog";
import { AddDocDialog } from "./add-doc-dialog";

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

function composeStartEndAt(dayDate: string | undefined, startHHMM: string, endHHMM: string) {
  if (!dayDate) return { startAt: undefined, endAt: undefined };
  return {
    startAt: new Date(`${dayDate}T${startHHMM}:00`).toISOString(),
    endAt: new Date(`${dayDate}T${endHHMM}:00`).toISOString(),
  };
}

function toHHMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export interface PlaceRowProps {
  place: TripEvent;
  dayDate?: string;
  isLast?: boolean;
  onUpdate: (event: TripEvent) => void;
  onDelete: (id: string) => void;
  onAddDoc?: (eventId: string, input: { name: string; kind: string; url?: string; offline?: boolean }) => void;
  onDeleteDoc?: (docId: string) => void;
  dragHandle?: React.ReactNode;
  id?: string;
  isDraft?: boolean;
  onCreate?: (name: string) => void;
  onCancelDraft?: () => void;
}

export function PlaceRow({
  place: p,
  dayDate,
  isLast,
  onUpdate,
  onDelete,
  onAddDoc,
  onDeleteDoc,
  dragHandle,
  id,
  isDraft,
  onCreate,
  onCancelDraft,
}: PlaceRowProps) {
  const [showDocs, setShowDocs] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const [isEditingName, setIsEditingName] = useState(isDraft ?? false);
  const [draftName, setDraftName] = useState(p.name);

  const [isEditingNote, setIsEditingNote] = useState(false);
  const [draftNote, setDraftNote] = useState(p.note ?? "");

  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showCostDialog, setShowCostDialog] = useState(false);
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [showAddDocDialog, setShowAddDocDialog] = useState(false);

  const now = useNow();
  const hasDocs = (p.docs?.length ?? 0) > 0;
  const isNow = isEventNow(p, now);

  function saveName() {
    const trimmed = draftName.trim();
    if (isDraft) {
      if (trimmed) onCreate?.(trimmed);
      else onCancelDraft?.();
      return;
    }
    if (trimmed && trimmed !== p.name) onUpdate({ ...p, name: trimmed });
    else setDraftName(p.name);
    setIsEditingName(false);
  }

  function saveNote() {
    const val = draftNote.trim() || undefined;
    if (val !== p.note) onUpdate({ ...p, note: val });
    setIsEditingNote(false);
  }

  const timeLabel = p.startAt
    ? p.endAt
      ? `${formatTime(toHHMM(p.startAt))} – ${formatTime(toHHMM(p.endAt))}`
      : formatTime(toHHMM(p.startAt))
    : null;

  return (
    <div
      id={id}
      className="group relative"
      style={{ zIndex: showTimePicker ? 10 : undefined }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className="flex items-start gap-3 rounded-[8px] px-3 py-2.5"
        style={{
          background: isNow ? "var(--accent-soft)" : undefined,
          border: isNow ? "1px solid var(--accent-brand)" : "1px solid transparent",
        }}
      >
        {/* Event icon */}
        <div className="flex flex-col items-center shrink-0 pt-0.5" style={{ width: 16 }}>
          <MapPin
            size={16}
            strokeWidth={1.5}
            style={{ color: isNow ? "var(--accent-brand)" : "var(--fg-3)", flexShrink: 0 }}
          />
          {!isLast && <div style={{ width: 1, flex: 1, minHeight: 12, background: "var(--line)", marginTop: 2 }} />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Name row */}
          <div className="flex items-center gap-1.5 min-w-0">
            {isEditingName ? (
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") {
                    if (isDraft) {
                      onCancelDraft?.();
                      return;
                    }
                    setDraftName(p.name);
                    setIsEditingName(false);
                  }
                }}
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--fg)",
                  background: "var(--surface-2)",
                  border: "1px solid var(--accent-brand)",
                  borderRadius: 4,
                  padding: "1px 6px",
                  outline: "none",
                  width: "100%",
                  fontFamily: "inherit",
                }}
              />
            ) : (
              <>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)", lineHeight: 1.2 }}>{p.name}</span>
                <button
                  onClick={() => {
                    setDraftName(p.name);
                    setIsEditingName(true);
                  }}
                  style={{
                    color: "var(--fg-4)",
                    opacity: isHovered ? 1 : 0.25,
                    transition: "opacity 0.1s",
                    display: "flex",
                    alignItems: "center",
                    padding: 2,
                    borderRadius: 3,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
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
                onChange={(e) => setDraftNote(e.target.value)}
                onBlur={saveNote}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setDraftNote(p.note ?? "");
                    setIsEditingNote(false);
                  }
                }}
                rows={2}
                style={{
                  width: "100%",
                  fontSize: 12,
                  color: "var(--fg-2)",
                  background: "var(--surface-2)",
                  border: "1px solid var(--accent-brand)",
                  borderLeft: "2px solid var(--accent-brand)",
                  borderRadius: 6,
                  padding: "6px 10px",
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                  lineHeight: 1.5,
                }}
              />
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  setDraftNote(p.note ?? "");
                  setIsEditingNote(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setDraftNote(p.note ?? "");
                    setIsEditingNote(true);
                  }
                }}
                style={{
                  fontSize: 12,
                  cursor: "text",
                  borderRadius: 6,
                  padding: "4px 10px",
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  color: p.note ? "var(--fg-2)" : "var(--fg-4)",
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
                onClick={() => setShowTimePicker((v) => !v)}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
                style={{
                  fontSize: 11,
                  color: p.startAt ? "var(--accent-ink)" : "var(--fg-4)",
                  background: p.startAt ? "var(--accent-soft)" : "none",
                  border: "1px solid transparent",
                }}
              >
                <Clock size={11} strokeWidth={1.5} />
                {timeLabel ?? "Add time"}
              </button>
              {showTimePicker && (
                <TimePickerDropdown
                  time={p.startAt ? toHHMM(p.startAt) : undefined}
                  endTime={p.endAt ? toHHMM(p.endAt) : undefined}
                  onSave={(t, et) => {
                    if (!t) {
                      onUpdate({ ...p, startAt: undefined, endAt: undefined });
                    } else {
                      onUpdate({ ...p, ...composeStartEndAt(dayDate, t, et ?? t) });
                    }
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
                color: p.locationAddress ? "var(--accent-ink)" : "var(--fg-4)",
                background: p.locationAddress ? "var(--accent-soft)" : "none",
                border: "1px solid transparent",
                maxWidth: 160,
              }}
            >
              <MapPin size={11} strokeWidth={1.5} style={{ flexShrink: 0 }} />
              <span className="truncate">{p.locationAddress ?? "Add location"}</span>
            </button>

            {/* Cost */}
            <button
              onClick={() => setShowCostDialog(true)}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
              style={{
                fontSize: 11,
                color: p.cost !== undefined ? "var(--accent-ink)" : "var(--fg-4)",
                background: p.cost !== undefined ? "var(--accent-soft)" : "none",
                border: "1px solid transparent",
              }}
            >
              <DollarSign size={11} strokeWidth={1.5} />
              {p.cost !== undefined ? p.cost.toFixed(2) : "Add cost"}
            </button>

            {/* Docs toggle */}
            {hasDocs && (
              <button
                onClick={() => setShowDocs((v) => !v)}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
                style={{
                  fontSize: 11,
                  color: "var(--accent-ink)",
                  background: "var(--accent-soft)",
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

            {/* Attach button — only when no docs */}
            {!hasDocs && (
              <button
                onClick={() => setShowAddDocDialog(true)}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
                style={{ fontSize: 11, color: "var(--fg-4)", border: "1px solid transparent" }}
                title="Attach document"
              >
                <Paperclip size={11} strokeWidth={1.5} />
                Attach
              </button>
            )}
          </div>

          {showDocs && hasDocs && (
            <DocsBlock
              docs={p.docs!}
              onDelete={(docId) => onDeleteDoc?.(docId)}
              onAdd={() => setShowAddDocDialog(true)}
            />
          )}
        </div>

        {/* Drag handle — always visible on mobile, hover-only on desktop */}
        {dragHandle && (
          <span
            className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center"
            style={{ color: "var(--fg-4)" }}
          >
            {dragHandle}
          </span>
        )}

        {/* Trash icon — always visible on mobile, hover-only on desktop */}
        <button
          onClick={() => onDelete(p.id)}
          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center"
          style={{
            color: "var(--fg-4)",
            padding: 4,
            borderRadius: 4,
            background: "none",
            border: "none",
            cursor: "pointer",
            flexShrink: 0,
          }}
          title="Delete event"
        >
          <Trash2 size={13} strokeWidth={1.5} />
        </button>
      </div>

      <CostDialog
        cost={p.cost}
        open={showCostDialog}
        onOpenChange={setShowCostDialog}
        onSave={(cost) => onUpdate({ ...p, cost })}
      />
      <LocationDialog
        address={p.locationAddress}
        open={showLocationDialog}
        onOpenChange={setShowLocationDialog}
        onSave={(address) => onUpdate({ ...p, locationAddress: address })}
      />
      <AddDocDialog
        open={showAddDocDialog}
        onOpenChange={setShowAddDocDialog}
        onAdd={(doc) => onAddDoc?.(p.id, { name: doc.name, kind: doc.kind, url: doc.url, offline: doc.offline })}
      />
    </div>
  );
}
