"use client";

import { useState, useEffect, useMemo } from "react";
import { useNow } from "@/components/providers/mock-date-provider";
import { type GapZoneProps } from "./gap-zone";
import { DayCardHeader } from "./day-card-header";
import { DayCardBottomAdd, DayCardDnd, type RenderEntry, type TimelineItem } from "./day-card-dnd";
import { type DayItinerary, type TripEvent, type DayItemType, type Document, ItineraryItemType } from "@/data/types";

interface DayCardProps {
  day: DayItinerary;
  dateFormat?: string;
  tripDocs?: Document[];
  initialOpen?: boolean;
  onUpdateEvent: (event: TripEvent) => void;
  onDeleteEvent: (id: string) => void;
  onReorderDayItems: (dayNumber: number, orderedItems: { type: DayItemType; id: string }[]) => void;
  onUpdateDay?: (dayNumber: number, updates: Partial<DayItinerary>) => void;
  onAddEvent?: (dayNumber: number, name: string, afterEventId?: string, insertAtPosition?: number) => void;
  onAddNote?: (dayNumber: number, content: string, insertAtPosition?: number) => void;
  onUpdateNote?: (noteId: string, content: string) => void;
  onDeleteNote?: (noteId: string) => void;
  onAddChecklist?: (dayNumber: number, insertAtPosition: number, firstItemContent?: string) => void;
  newlyCreatedChecklistId?: string;
  onUpdateChecklistTitle?: (checklistId: string, title: string | undefined) => void;
  onDeleteChecklist?: (checklistId: string) => void;
  onAddChecklistItem?: (checklistId: string, content: string) => void;
  onUpdateChecklistItem?: (itemId: string, content: string) => void;
  onDeleteChecklistItem?: (itemId: string) => void;
  onToggleChecklistItem?: (itemId: string) => void;
}

interface DraftState {
  kind: ItineraryItemType;
  insertAtPosition: number;
  gapKey: string;
}

// ── Timeline types ────────────────────────────────────────────────────────────

// ── DayCard ───────────────────────────────────────────────────────────────────

export function DayCard({
  day: d,
  dateFormat = "MM/DD/YYYY",
  tripDocs,
  initialOpen,
  onUpdateEvent,
  onDeleteEvent,
  onReorderDayItems,
  onUpdateDay,
  onAddEvent,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onAddChecklist,
  newlyCreatedChecklistId,
  onUpdateChecklistTitle,
  onDeleteChecklist,
  onAddChecklistItem,
  onUpdateChecklistItem,
  onDeleteChecklistItem,
  onToggleChecklistItem,
}: DayCardProps) {
  const now = useNow();
  const isToday = d.date
    ? (() => {
        const dayDate = new Date(d.date + "T12:00:00");
        return (
          dayDate.getFullYear() === now.getFullYear() &&
          dayDate.getMonth() === now.getMonth() &&
          dayDate.getDate() === now.getDate()
        );
      })()
    : !!d.today;

  const [open, setOpen] = useState(initialOpen ?? isToday);
  const [openGapKey, setOpenGapKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);

  const dateDisplay = d.date
    ? (() => {
        const date = new Date(d.date + "T12:00:00");
        const weekday = date.toLocaleString("en-US", { weekday: "short" });
        const day = date.getDate();
        const month = date.toLocaleString("en-US", { month: "short" });
        const datePart = dateFormat === "DD/MM/YYYY" ? `${day} ${month}` : `${month} ${day}`;
        return `${weekday}, ${datePart}`;
      })()
    : d.label.replace(" · ", ", ");

  const [optimisticOrder, setOptimisticOrder] = useState<string[] | null>(null);

  const allEvents = d.events;
  const notes = d.notes ?? [];
  const checklists = d.checklists ?? [];

  const propTimelineItems: TimelineItem[] = [
    ...allEvents.map((e) => ({ kind: "event" as const, data: e, position: e.position })),
    ...notes.map((n) => ({ kind: "note" as const, data: n, position: n.position })),
    ...checklists.map((c) => ({ kind: "checklist" as const, data: c, position: c.position })),
  ].sort((a, b) => a.position - b.position);

  const timelineItems = useMemo(() => {
    if (!optimisticOrder) return propTimelineItems;
    const byId = new Map(propTimelineItems.map((it) => [it.data.id, it]));
    const ordered: TimelineItem[] = [];
    for (const id of optimisticOrder) {
      const item = byId.get(id);
      if (item) ordered.push(item);
    }
    return ordered.length === propTimelineItems.length ? ordered : propTimelineItems;
  }, [propTimelineItems, optimisticOrder]);

  useEffect(() => {
    if (optimisticOrder === null) return;
    const propIds = propTimelineItems.map((it) => it.data.id).join("");
    const optIds = optimisticOrder.join("");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: clear optimistic state once parent prop has caught up; the guard above prevents loops
    if (propIds === optIds) setOptimisticOrder(null);
  }, [propTimelineItems, optimisticOrder]);

  const maxTimelinePos = timelineItems.length > 0 ? Math.max(...timelineItems.map((item) => item.position)) : -1;
  const bottomInsertPosition = maxTimelinePos + 1;

  // Build render list, injecting the draft at the right index
  const renderEntries: RenderEntry[] = timelineItems.map((item, idx) => ({
    type: "timeline" as const,
    item,
    idx,
  }));

  if (draft !== null) {
    const insertIdx = draft.gapKey === "bottom" ? renderEntries.length : parseInt(draft.gapKey.slice(3), 10) + 1;
    renderEntries.splice(insertIdx, 0, { type: "draft" as const, draftKind: draft.kind });
  }

  function openGap(key: string) {
    setOpenGapKey(key);
    setDraft(null);
  }

  function activateDraft(type: ItineraryItemType, insertAtPosition: number, gapKey: string) {
    setOpenGapKey(null);
    setDraft({ kind: type, insertAtPosition, gapKey });
  }

  function commitDraft(content: string) {
    if (!draft) return;
    if (draft.kind === ItineraryItemType.Note) {
      onAddNote?.(d.dayNumber, content, draft.insertAtPosition);
    } else {
      const gapIdx = draft.gapKey === "bottom" ? -1 : parseInt(draft.gapKey.slice(3), 10);
      const itemBefore = gapIdx >= 0 ? timelineItems[gapIdx] : undefined;
      const afterEventId = itemBefore?.kind === "event" ? itemBefore.data.id : undefined;
      if (afterEventId) {
        onAddEvent?.(d.dayNumber, content, afterEventId);
      } else {
        onAddEvent?.(d.dayNumber, content, undefined, draft.insertAtPosition);
      }
    }
    setDraft(null);
  }

  function cancelDraft() {
    setDraft(null);
  }

  function makeGapProps(gapKey: string, insertAtPosition: number): GapZoneProps {
    return {
      gapKey,
      isActive: openGapKey === gapKey,
      onOpen: draft !== null ? () => {} : () => openGap(gapKey),
      onSelectType: (type) => activateDraft(type, insertAtPosition, gapKey),
      onDismiss: () => setOpenGapKey(null),
    };
  }

  return (
    <div
      className="rounded-[10px] mb-4"
      style={{
        border: isToday ? "1.5px solid var(--accent-brand)" : "1px solid var(--line)",
        background: "var(--bg)",
      }}
    >
      <DayCardHeader
        dateDisplay={dateDisplay}
        isToday={isToday}
        stopsCount={d.events.length}
        subtitle={d.subtitle}
        open={open}
        onToggle={() => setOpen((v) => !v)}
        dayNumber={d.dayNumber}
        onUpdateDay={onUpdateDay}
      />

      {/* Collapsible body */}
      {open && (
        <div className="p-3 flex flex-col">
          <DayCardDnd
            dayNumber={d.dayNumber}
            dayId={d.id}
            dayDate={d.date}
            timelineItems={timelineItems}
            renderEntries={renderEntries}
            tripDocs={tripDocs}
            newlyCreatedChecklistId={newlyCreatedChecklistId}
            draftInsertAtPosition={draft?.insertAtPosition}
            makeGapProps={makeGapProps}
            commitDraft={commitDraft}
            cancelDraft={cancelDraft}
            setOptimisticOrder={setOptimisticOrder}
            onReorderDayItems={onReorderDayItems}
            onUpdateEvent={onUpdateEvent}
            onDeleteEvent={onDeleteEvent}
            onAddChecklist={onAddChecklist}
            onUpdateNote={onUpdateNote}
            onDeleteNote={onDeleteNote}
            onUpdateChecklistTitle={onUpdateChecklistTitle}
            onDeleteChecklist={onDeleteChecklist}
            onAddChecklistItem={onAddChecklistItem}
            onUpdateChecklistItem={onUpdateChecklistItem}
            onDeleteChecklistItem={onDeleteChecklistItem}
            onToggleChecklistItem={onToggleChecklistItem}
          />

          <DayCardBottomAdd
            dayNumber={d.dayNumber}
            openGapKey={openGapKey}
            bottomInsertPosition={bottomInsertPosition}
            openGap={openGap}
            activateDraft={activateDraft}
            closeGap={() => setOpenGapKey(null)}
          />
        </div>
      )}
    </div>
  );
}
