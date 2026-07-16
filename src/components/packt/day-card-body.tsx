"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import type { GapZoneProps } from "./gap-zone";
import { DayCardDnd, type RenderEntry, type TimelineItem } from "./day-card-dnd";
import { DayCardBottomAdd } from "./day-card-bottom-add";
import { ItineraryItemType } from "@/data/types";
import type { DayItinerary, TripEvent, DayItemType, Document, DayRouteSummary, TransitMode } from "@/data/types";
import { getDayRouteSummary } from "@/app/(app)/trips/[tripId]/route-actions";
import { DayRouteStrip } from "./day-route-strip";
import { useScheduleConflicts } from "./use-schedule-conflicts";
import { ScheduleConflictBadge } from "./schedule-conflict-badge";

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
}

interface DraftState {
  kind: ItineraryItemType;
  insertAtPosition: number;
  gapKey: string;
}

interface RouteSummaryState {
  key: string;
  summary: DayRouteSummary;
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
  tripId,
  tripTransitMode,
  walkThresholdMeters,
}: DayCardBodyProps): ReactElement {
  const [openGapKey, setOpenGapKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [optimisticOrder, setOptimisticOrder] = useState<string[] | null>(null);
  const pendingCommitBaselineRef = useRef<number | null>(null);
  const locatedEvents = useMemo(
    () => day.events.filter((event) => event.locationLat != null && event.locationLng != null),
    [day.events]
  );
  const routeSummaryKey = [
    tripId ?? "none",
    tripTransitMode ?? "none",
    walkThresholdMeters ?? "none",
    ...locatedEvents.map((event) => `${event.id}:${event.locationLat}:${event.locationLng}:${event.position}`),
  ].join("|");
  const [routeSummaryState, setRouteSummaryState] = useState<RouteSummaryState>(() => ({
    key: routeSummaryKey,
    summary: { status: "loading" },
  }));
  const routeSummary: DayRouteSummary =
    routeSummaryState.key === routeSummaryKey ? routeSummaryState.summary : { status: "loading" };

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

  useEffect(() => {
    if (pendingCommitBaselineRef.current === null) return;
    // The add action's promise can resolve slightly before the revalidated `day` prop lands,
    // so wait for the real item to actually show up in props instead of clearing on a timer.
    if (propTimelineItems.length > pendingCommitBaselineRef.current) {
      pendingCommitBaselineRef.current = null;

      setDraft(null);
    }
  }, [propTimelineItems]);

  useEffect(() => {
    if (locatedEvents.length < 2 || !tripId || !tripTransitMode) return;
    let active = true;
    void getDayRouteSummary(tripId, locatedEvents, tripTransitMode, walkThresholdMeters)
      .then((summary) => {
        if (active) setRouteSummaryState({ key: routeSummaryKey, summary });
      })
      .catch(() => {
        if (active) setRouteSummaryState({ key: routeSummaryKey, summary: { status: "unavailable" } });
      });
    return () => {
      active = false;
    };
  }, [locatedEvents, routeSummaryKey, tripId, tripTransitMode, walkThresholdMeters]);

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

  function openGap(gapKey: string): void {
    setOpenGapKey(gapKey);
    setDraft(null);
  }

  function activateDraft(type: ItineraryItemType, insertAtPosition: number, gapKey: string): void {
    setOpenGapKey(null);
    setDraft({ kind: type, insertAtPosition, gapKey });
  }

  async function commitDraft(content: string): Promise<void> {
    if (!draft) return;
    const baselineCount = propTimelineItems.length;
    try {
      if (draft.kind === ItineraryItemType.Note) {
        await onAddNote?.(day.dayNumber, content, draft.insertAtPosition);
      } else if (draft.kind === ItineraryItemType.Checklist) {
        await onAddChecklist?.(day.dayNumber, draft.insertAtPosition, content || undefined);
      } else {
        const gapIndex = draft.gapKey === "bottom" ? -1 : parseInt(draft.gapKey.slice(3), 10);
        const itemBefore = gapIndex >= 0 ? timelineItems[gapIndex] : undefined;
        const afterEventId =
          itemBefore?.kind === "event" && !itemBefore.data.linkedReservationId ? itemBefore.data.id : undefined;
        if (afterEventId) {
          await onAddEvent?.(day.dayNumber, content, afterEventId);
        } else {
          await onAddEvent?.(day.dayNumber, content, undefined, draft.insertAtPosition);
        }
      }
      pendingCommitBaselineRef.current = baselineCount;
    } catch {
      // handler already surfaced a toast; keep the draft open so the user can retry
    }
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
      {locatedEvents.length >= 2 && tripId && tripTransitMode && (
        <DayRouteStrip
          summary={routeSummary}
          tripId={tripId}
          dayNumber={day.dayNumber}
          tripTransitMode={tripTransitMode}
          totalHopCount={locatedEvents.length - 1}
        />
      )}
      <ScheduleConflictBadge count={conflicts.length} conflictingEventNames={conflictingEventNames} />
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
        cancelDraft={() => setDraft(null)}
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
        closeGap={() => setOpenGapKey(null)}
        onOpenPackingListPicker={onOpenPackingListPicker}
      />
    </div>
  );
}
