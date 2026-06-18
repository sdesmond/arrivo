"use client";

import { useState } from "react";
import { MapPin, Trash2 } from "lucide-react";
import { IconSize } from "@/lib/size-tokens";
import { type TripEvent, type Document } from "@/data/types";
import { isEventNow } from "@/lib/utils";
import { useNow } from "@/components/providers/mock-date-provider";
import { DocsBlock } from "./docs-block";
import { PlaceRowNameField } from "./place-row-name-field";
import { PlaceRowActionBar } from "./place-row-action-bar";
import { PlaceRowDialogs } from "./place-row-dialogs";

function composeStartEndAt(dayDate: string | undefined, startHHMM: string, endHHMM: string) {
  if (!dayDate) return { startAt: undefined, endAt: undefined };
  return {
    startAt: new Date(`${dayDate}T${startHHMM}:00`).toISOString(),
    endAt: new Date(`${dayDate}T${endHHMM}:00`).toISOString(),
  };
}

export interface PlaceRowProps {
  place: TripEvent;
  dayDate?: string;
  isLast?: boolean;
  onUpdate: (event: TripEvent) => void;
  onDelete: (id: string) => void;
  dragHandle?: React.ReactNode;
  id?: string;
  isDraft?: boolean;
  onCreate?: (name: string) => void;
  onCancelDraft?: () => void;
  tripDocs?: Document[];
}

export function PlaceRow({
  place,
  dayDate,
  isLast,
  onUpdate,
  onDelete,
  dragHandle,
  id,
  isDraft,
  onCreate,
  onCancelDraft,
  tripDocs,
}: PlaceRowProps) {
  const [showDocs, setShowDocs] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const [isEditingName, setIsEditingName] = useState(isDraft ?? false);
  const [draftName, setDraftName] = useState(place.name);

  const [isEditingNote, setIsEditingNote] = useState(false);
  const [draftNote, setDraftNote] = useState(place.note ?? "");

  const [showTimeDialog, setShowTimeDialog] = useState(false);
  const [showCostDialog, setShowCostDialog] = useState(false);
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [showAddDocDialog, setShowAddDocDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const now = useNow();
  const hasDocs = (place.docs?.length ?? 0) > 0;
  const isNow = isEventNow(place, now);

  function saveName() {
    const trimmed = draftName.trim();
    if (isDraft) {
      if (trimmed) onCreate?.(trimmed);
      else onCancelDraft?.();
      return;
    }
    if (trimmed && trimmed !== place.name) onUpdate({ ...place, name: trimmed });
    else setDraftName(place.name);
    setIsEditingName(false);
  }

  function saveNote() {
    const val = draftNote.trim() || undefined;
    if (val !== place.note) onUpdate({ ...place, note: val });
    setIsEditingNote(false);
  }

  return (
    <div
      id={id}
      className="group relative"
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
          <PlaceRowNameField
            isEditingName={isEditingName}
            draftName={draftName}
            onDraftChange={setDraftName}
            onBlur={saveName}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveName();
              if (event.key === "Escape") {
                if (isDraft) {
                  onCancelDraft?.();
                  return;
                }
                setDraftName(place.name);
                setIsEditingName(false);
              }
            }}
            displayName={place.name}
            isHovered={isHovered}
            isDraft={isDraft}
            onStartEdit={() => {
              setDraftName(place.name);
              setIsEditingName(true);
            }}
          />

          {/* Note area */}
          <div className="mt-1.5">
            {isEditingNote ? (
              <textarea
                autoFocus
                value={draftNote}
                onChange={(event) => setDraftNote(event.target.value)}
                onBlur={saveNote}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setDraftNote(place.note ?? "");
                    setIsEditingNote(false);
                  }
                }}
                rows={2}
                style={{
                  width: "100%",
                  fontSize: "calc(var(--fs-card-sub) * var(--font-scale))",
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
                  setDraftNote(place.note ?? "");
                  setIsEditingNote(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    setDraftNote(place.note ?? "");
                    setIsEditingNote(true);
                  }
                }}
                style={{
                  fontSize: "calc(var(--fs-card-sub) * var(--font-scale))",
                  cursor: "text",
                  borderRadius: 6,
                  padding: "4px 10px",
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  color: place.note ? "var(--fg-2)" : "var(--fg-4)",
                }}
              >
                {place.note ?? "Add a note…"}
              </div>
            )}
          </div>

          <PlaceRowActionBar
            place={place}
            showDocs={showDocs}
            onToggleDocs={() => setShowDocs((prev) => !prev)}
            onOpenTime={() => setShowTimeDialog(true)}
            onOpenLocation={() => setShowLocationDialog(true)}
            onOpenCost={() => setShowCostDialog(true)}
            onOpenAddDoc={() => setShowAddDocDialog(true)}
          />

          {showDocs && hasDocs && <DocsBlock docs={place.docs!} onAdd={() => setShowAddDocDialog(true)} />}
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
          onClick={() => {
            if (hasDocs) {
              setShowDeleteDialog(true);
            } else {
              onDelete(place.id);
            }
          }}
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
          <Trash2 size={IconSize.placeAction} strokeWidth={1.5} />
        </button>
      </div>

      <PlaceRowDialogs
        place={place}
        tripDocs={tripDocs}
        showTimeDialog={showTimeDialog}
        onTimeOpenChange={setShowTimeDialog}
        onTimeSave={(time, et) => {
          if (!time) {
            onUpdate({ ...place, startAt: undefined, endAt: undefined });
          } else {
            onUpdate({ ...place, ...composeStartEndAt(dayDate, time, et ?? time) });
          }
        }}
        showCostDialog={showCostDialog}
        onCostOpenChange={setShowCostDialog}
        onCostSave={(cost) => onUpdate({ ...place, cost })}
        showLocationDialog={showLocationDialog}
        onLocationOpenChange={setShowLocationDialog}
        onLocationSave={(location) =>
          onUpdate({
            ...place,
            locationName: location?.name,
            locationAddress: location?.address,
            locationLat: location?.lat,
            locationLng: location?.lng,
          })
        }
        showAddDocDialog={showAddDocDialog}
        onAddDocOpenChange={setShowAddDocDialog}
        showDeleteDialog={showDeleteDialog}
        onDeleteOpenChange={setShowDeleteDialog}
      />
    </div>
  );
}
