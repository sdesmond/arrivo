"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { GapZoneProps } from "./gap-zone";
import { DayCardDnd, type RenderEntry, type TimelineItem } from "./day-card-dnd";
import { DayCardBottomAdd } from "./day-card-bottom-add";
import { ItineraryItemType } from "@/data/types";
import type { DayItinerary, TripEvent, DayItemType, Document } from "@/data/types";

export interface DayCardBodyProps {
  day: DayItinerary;
  tripDocs?: Document[];
  onUpdateEvent: (event: TripEvent) => void;
  onDeleteEvent: (id: string) => void;
  onLinkedEventTap?: (linkedReservationId: string) => void;
  onReorderDayItems: (dayNumber: number, orderedItems: { type: DayItemType; id: string }[]) => void;
  onAddEvent?: (dayNumber: number, name: string, afterEventId?: string, insertAtPosition?: number) => void;
  onAddNote?: (dayNumber: number, content: string, insertAtPosition?: number) => void;
  onUpdateNote?: (noteId: string, content: string) => void;
  onDeleteNote?: (noteId: string) => void;
  onAddChecklist?: (dayNumber: number, insertAtPosition: number, firstItemContent?: string) => void;
  newlyCreatedChecklistId?: string;
  onOpenPackingListPicker?: (insertAtPosition: number) => void;
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

export function DayCardBody({
  day,
  tripDocs,
  onUpdateEvent,
  onDeleteEvent,
  onLinkedEventTap,
  onReorderDayItems,
  onAddEvent,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onAddChecklist,
  newlyCreatedChecklistId,
  onOpenPackingListPicker,
  onUpdateChecklistTitle,
  onDeleteChecklist,
  onAddChecklistItem,
  onUpdateChecklistItem,
  onDeleteChecklistItem,
  onToggleChecklistItem,
}: DayCardBodyProps): ReactElement {
  const [openGapKey, setOpenGapKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [optimisticOrder, setOptimisticOrder] = useState<string[] | null>(null);

  const propTimelineItems: TimelineItem[] = [
    ...day.events.map((event) => ({ kind: "event" as const, data: event, position: event.position })),
    ...(day.notes ?? []).map((note) => ({ kind: "note" as const, data: note, position: note.position })),
    ...(day.checklists ?? []).map((checklist) => ({
      kind: "checklist" as const,
      data: checklist,
      position: checklist.position,
    })),
  ].sort((first, second) => first.position - second.position);

  const timelineItems = useMemo(() => {
    if (!optimisticOrder) return propTimelineItems;
    const byId = new Map(propTimelineItems.map((item) => [item.data.id, item]));
    const ordered = optimisticOrder.flatMap((id) => {
      const item = byId.get(id);
      return item ? [item] : [];
    });
    return ordered.length === propTimelineItems.length ? ordered : propTimelineItems;
  }, [propTimelineItems, optimisticOrder]);

  useEffect(() => {
    if (optimisticOrder === null) return;
    const propIds = propTimelineItems.map((item) => item.data.id).join("\u0001");
    const optimisticIds = optimisticOrder.join("\u0001");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear optimistic state when refreshed props catch up
    if (propIds === optimisticIds) setOptimisticOrder(null);
  }, [propTimelineItems, optimisticOrder]);

  const maxTimelinePosition = timelineItems.length > 0 ? Math.max(...timelineItems.map((item) => item.position)) : -1;
  const bottomInsertPosition = maxTimelinePosition + 1;
  const renderEntries: RenderEntry[] = timelineItems.map((item, index) => ({
    type: "timeline" as const,
    item,
    idx: index,
  }));

  if (draft !== null) {
    const insertIndex = draft.gapKey === "bottom" ? renderEntries.length : parseInt(draft.gapKey.slice(3), 10) + 1;
    renderEntries.splice(insertIndex, 0, { type: "draft" as const, draftKind: draft.kind });
  }

  function openGap(gapKey: string): void {
    setOpenGapKey(gapKey);
    setDraft(null);
  }

  function activateDraft(type: ItineraryItemType, insertAtPosition: number, gapKey: string): void {
    setOpenGapKey(null);
    setDraft({ kind: type, insertAtPosition, gapKey });
  }

  function commitDraft(content: string): void {
    if (!draft) return;
    if (draft.kind === ItineraryItemType.Note) {
      onAddNote?.(day.dayNumber, content, draft.insertAtPosition);
    } else {
      const gapIndex = draft.gapKey === "bottom" ? -1 : parseInt(draft.gapKey.slice(3), 10);
      const itemBefore = gapIndex >= 0 ? timelineItems[gapIndex] : undefined;
      const afterEventId =
        itemBefore?.kind === "event" && !itemBefore.data.linkedReservationId ? itemBefore.data.id : undefined;
      if (afterEventId) {
        onAddEvent?.(day.dayNumber, content, afterEventId);
      } else {
        onAddEvent?.(day.dayNumber, content, undefined, draft.insertAtPosition);
      }
    }
    setDraft(null);
  }

  function makeGapProps(gapKey: string, insertAtPosition: number): GapZoneProps {
    return {
      gapKey,
      isActive: openGapKey === gapKey,
      onOpen: draft !== null ? () => {} : () => openGap(gapKey),
      onSelectType: (type) => activateDraft(type, insertAtPosition, gapKey),
      onDismiss: () => setOpenGapKey(null),
      onOpenPackingListPicker: onOpenPackingListPicker ? () => onOpenPackingListPicker(insertAtPosition) : undefined,
    };
  }

  return (
    <div className="p-3 flex flex-col">
      <DayCardDnd
        dayNumber={day.dayNumber}
        dayId={day.id}
        dayDate={day.date}
        timelineItems={timelineItems}
        renderEntries={renderEntries}
        tripDocs={tripDocs}
        newlyCreatedChecklistId={newlyCreatedChecklistId}
        draftInsertAtPosition={draft?.insertAtPosition}
        makeGapProps={makeGapProps}
        commitDraft={commitDraft}
        cancelDraft={() => setDraft(null)}
        setOptimisticOrder={setOptimisticOrder}
        onReorderDayItems={onReorderDayItems}
        onUpdateEvent={onUpdateEvent}
        onDeleteEvent={onDeleteEvent}
        onLinkedEventTap={onLinkedEventTap}
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
        dayNumber={day.dayNumber}
        openGapKey={openGapKey}
        bottomInsertPosition={bottomInsertPosition}
        openGap={openGap}
        activateDraft={activateDraft}
        closeGap={() => setOpenGapKey(null)}
        onOpenPackingListPicker={onOpenPackingListPicker}
      />
    </div>
  );
}
