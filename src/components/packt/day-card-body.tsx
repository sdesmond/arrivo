"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DayCardDnd, type RenderEntry, type TimelineItem } from "./day-card-dnd";
import { DayCardBottomAdd } from "./day-card-bottom-add";
import type { DayItinerary, TripEvent, DayItemType, Document, TransitMode } from "@/data/types";
import { DayRouteStrip } from "./day-route-strip";
import { useScheduleConflicts } from "./use-schedule-conflicts";
import { useDayDraft } from "./use-day-draft";
import { useDayRouteSummary } from "./use-day-route-summary";

export interface DayCardBodyProps {
  day: DayItinerary;
  tripId?: string;
  tripTransitMode?: TransitMode | null;
  walkThresholdMeters?: number | null;
  defaultExpenseCurrency?: string;
  tripDocs?: Document[];
  onUpdateEvent: (event: TripEvent) => void;
  onDeleteEvent: (id: string) => void;
  onLinkedEventTap?: (linkedReservationId: string) => void;
  onReorderDayItems: (dayNumber: number, orderedItems: { type: DayItemType; id: string }[]) => void;
  onAddEvent?: (dayNumber: number, name: string, afterEventId?: string, insertAtPosition?: number) => Promise<void>;
  onAddNote?: (dayNumber: number, content: string, insertAtPosition?: number) => Promise<void>;
  onUpdateNote?: (noteId: string, content: string) => void;
  onDeleteNote?: (noteId: string) => void;
  onAddChecklist?: (dayNumber: number, insertAtPosition: number, firstItemContent?: string) => Promise<void>;
  newlyCreatedChecklistId?: string;
  highlightedEventId?: string | null;
  onOpenPackingListPicker?: (insertAtPosition: number) => void;
  onUpdateChecklistTitle?: (checklistId: string, title: string | undefined) => void;
  onDeleteChecklist?: (checklistId: string) => void;
  onAddChecklistItem?: (checklistId: string, content: string) => void;
  onUpdateChecklistItem?: (itemId: string, content: string) => void;
  onDeleteChecklistItem?: (itemId: string) => void;
  onToggleChecklistItem?: (itemId: string) => void;
  onOpenMapTab?: (dayNumber: number) => void;
}

export function DayCardBody({
  day,
  defaultExpenseCurrency,
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
  highlightedEventId,
  onOpenPackingListPicker,
  onUpdateChecklistTitle,
  onDeleteChecklist,
  onAddChecklistItem,
  onUpdateChecklistItem,
  onDeleteChecklistItem,
  onToggleChecklistItem,
  onOpenMapTab,
  tripId,
  tripTransitMode,
  walkThresholdMeters,
}: DayCardBodyProps): ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [optimisticOrder, setOptimisticOrder] = useState<string[] | null>(null);
  const pendingRefocusEventIdRef = useRef<string | null>(null);
  const { routeSummary, locatedEvents } = useDayRouteSummary(day.events, tripId, tripTransitMode, walkThresholdMeters);

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

  const { draft, openGapKey, openGap, closeGap, activateDraft, commitDraft, cancelDraft, makeGapProps } = useDayDraft({
    dayNumber: day.dayNumber,
    timelineItems,
    propTimelineItemCount: propTimelineItems.length,
    onAddEvent,
    onAddNote,
    onAddChecklist,
    onOpenPackingListPicker,
  });

  const conflictEvents = useMemo(() => {
    const allItems = [
      ...day.events.map((event) => ({ kind: "event" as const, data: event, position: event.position })),
      ...(day.notes ?? []).map((note) => ({ kind: "note" as const, data: note, position: note.position })),
      ...(day.checklists ?? []).map((checklist) => ({
        kind: "checklist" as const,
        data: checklist,
        position: checklist.position,
      })),
    ].sort((first, second) => first.position - second.position);
    const itemById = new Map(allItems.map((item) => [item.data.id, item]));
    const orderedItems = optimisticOrder
      ? optimisticOrder.flatMap((id) => {
          const item = itemById.get(id);
          return item ? [item] : [];
        })
      : allItems;

    return orderedItems.filter((item) => item.kind === "event").map((item, position) => ({ ...item.data, position }));
  }, [day.events, day.notes, day.checklists, optimisticOrder]);

  useEffect(() => {
    if (optimisticOrder === null) return;
    const propIds = propTimelineItems.map((item) => item.data.id).join("\u0001");
    const optimisticIds = optimisticOrder.join("\u0001");

    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear optimistic state when refreshed props catch up
    if (propIds === optimisticIds) setOptimisticOrder(null);
  }, [propTimelineItems, optimisticOrder]);

  const conflicts = useScheduleConflicts(
    conflictEvents,
    conflictEvents.filter((event) => event.locationLat != null && event.locationLng != null).length,
    tripId,
    tripTransitMode,
    walkThresholdMeters
  );
  const conflictingEventIds = useMemo(() => new Set(conflicts.map((conflict) => conflict.currentEventId)), [conflicts]);
  const conflictingEventNames = useMemo(() => {
    const eventsById = new Map(day.events.map((event) => [event.id, event]));
    return conflicts.map((conflict) => eventsById.get(conflict.currentEventId)?.name ?? "stop");
  }, [conflicts, day.events]);

  useEffect(() => {
    if (pendingRefocusEventIdRef.current && searchParams.get("focus") === null) {
      const targetEventId = pendingRefocusEventIdRef.current;
      pendingRefocusEventIdRef.current = null;
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("focus", targetEventId);
      router.push(`${pathname}?${nextParams.toString()}`, { scroll: false });
    }
  }, [searchParams, pathname, router]);

  function handleConflictClick(): void {
    const targetEventId = conflicts[0]?.currentEventId;
    if (!targetEventId) return;
    if (searchParams.get("focus") === targetEventId) {
      // The URL already points at this event (e.g. a repeat click after the first
      // highlight faded) — pushing an identical URL is a no-op, so clear the param
      // first; the effect above re-applies it once the clear is actually observed,
      // forcing useFocusScroll's effect to re-fire.
      pendingRefocusEventIdRef.current = targetEventId;
      const clearedParams = new URLSearchParams(searchParams.toString());
      clearedParams.delete("focus");
      router.replace(`${pathname}?${clearedParams.toString()}`, { scroll: false });
      return;
    }
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("focus", targetEventId);
    router.push(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }

  const persistedTimelineItems = timelineItems.filter(
    (item) => item.kind !== "event" || !item.data.linkedReservationId
  );
  const maxTimelinePosition =
    persistedTimelineItems.length > 0 ? Math.max(...persistedTimelineItems.map((item) => item.position)) : -1;
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

  return (
    <div className="p-3 flex flex-col">
      {locatedEvents.length >= 2 && tripId && tripTransitMode && (
        <DayRouteStrip
          summary={routeSummary}
          tripId={tripId}
          dayNumber={day.dayNumber}
          tripTransitMode={tripTransitMode}
          totalHopCount={locatedEvents.length - 1}
          conflictCount={conflicts.length}
          conflictingEventNames={conflictingEventNames}
          onConflictClick={handleConflictClick}
          onThumbnailClick={onOpenMapTab ? () => onOpenMapTab(day.dayNumber) : undefined}
        />
      )}
      <DayCardDnd
        dayNumber={day.dayNumber}
        dayId={day.id}
        dayDate={day.date}
        defaultExpenseCurrency={defaultExpenseCurrency}
        timelineItems={timelineItems}
        renderEntries={renderEntries}
        tripDocs={tripDocs}
        newlyCreatedChecklistId={newlyCreatedChecklistId}
        highlightedEventId={highlightedEventId}
        draftInsertAtPosition={draft?.insertAtPosition}
        makeGapProps={makeGapProps}
        commitDraft={commitDraft}
        cancelDraft={cancelDraft}
        setOptimisticOrder={setOptimisticOrder}
        onReorderDayItems={onReorderDayItems}
        onUpdateEvent={onUpdateEvent}
        onDeleteEvent={onDeleteEvent}
        onLinkedEventTap={onLinkedEventTap}
        onUpdateNote={onUpdateNote}
        onDeleteNote={onDeleteNote}
        onUpdateChecklistTitle={onUpdateChecklistTitle}
        onDeleteChecklist={onDeleteChecklist}
        onAddChecklistItem={onAddChecklistItem}
        onUpdateChecklistItem={onUpdateChecklistItem}
        onDeleteChecklistItem={onDeleteChecklistItem}
        onToggleChecklistItem={onToggleChecklistItem}
        conflictingEventIds={conflictingEventIds}
      />
      <DayCardBottomAdd
        dayNumber={day.dayNumber}
        openGapKey={openGapKey}
        bottomInsertPosition={bottomInsertPosition}
        openGap={openGap}
        activateDraft={activateDraft}
        closeGap={closeGap}
        onOpenPackingListPicker={onOpenPackingListPicker}
      />
    </div>
  );
}
