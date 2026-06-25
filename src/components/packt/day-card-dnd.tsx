"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { PlaceRow } from "./place-row";
import { NoteItem } from "./note-item";
import { ChecklistItem } from "./checklist-item";
import { SortablePlaceRow, SortableNoteItem, SortableChecklistItem } from "./day-card-sortables";
import { GapZone, type GapZoneProps } from "./gap-zone";
import {
  type Checklist,
  type DayItemType,
  type Document,
  type ItineraryNote,
  ItineraryItemType,
  type TripEvent,
} from "@/data/types";

export type TimelineItem =
  | { kind: "event"; data: TripEvent; position: number }
  | { kind: "note"; data: ItineraryNote; position: number }
  | { kind: "checklist"; data: Checklist; position: number };

export type RenderEntry =
  | { type: "timeline"; item: TimelineItem; idx: number }
  | { type: "draft"; draftKind: ItineraryItemType };

export interface DayCardDndProps {
  dayNumber: number;
  dayId?: string;
  dayDate?: string;
  defaultExpenseCurrency?: string;
  timelineItems: TimelineItem[];
  renderEntries: RenderEntry[];
  tripDocs?: Document[];
  newlyCreatedChecklistId?: string;
  highlightedEventId?: string | null;
  draftInsertAtPosition?: number;
  makeGapProps: (gapKey: string, insertAtPosition: number) => GapZoneProps;
  commitDraft: (content: string) => void;
  cancelDraft: () => void;
  setOptimisticOrder: (order: string[]) => void;
  onReorderDayItems: (dayNumber: number, orderedItems: { type: DayItemType; id: string }[]) => void;
  onUpdateEvent: (event: TripEvent) => void;
  onDeleteEvent: (id: string) => void;
  onLinkedEventTap?: (linkedReservationId: string) => void;
  onAddChecklist?: (dayNumber: number, insertAtPosition: number, firstItemContent?: string) => void;
  onUpdateNote?: (noteId: string, content: string) => void;
  onDeleteNote?: (noteId: string) => void;
  onUpdateChecklistTitle?: (checklistId: string, title: string | undefined) => void;
  onDeleteChecklist?: (checklistId: string) => void;
  onAddChecklistItem?: (checklistId: string, content: string) => void;
  onUpdateChecklistItem?: (itemId: string, content: string) => void;
  onDeleteChecklistItem?: (itemId: string) => void;
  onToggleChecklistItem?: (itemId: string) => void;
}

export function DayCardDnd({
  dayNumber,
  dayId,
  dayDate,
  defaultExpenseCurrency,
  timelineItems,
  renderEntries,
  tripDocs,
  newlyCreatedChecklistId,
  highlightedEventId,
  draftInsertAtPosition,
  makeGapProps,
  commitDraft,
  cancelDraft,
  setOptimisticOrder,
  onReorderDayItems,
  onUpdateEvent,
  onDeleteEvent,
  onLinkedEventTap,
  onAddChecklist,
  onUpdateNote,
  onDeleteNote,
  onUpdateChecklistTitle,
  onDeleteChecklist,
  onAddChecklistItem,
  onUpdateChecklistItem,
  onDeleteChecklistItem,
  onToggleChecklistItem,
}: DayCardDndProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const oldIdx = timelineItems.findIndex((item) => item.data.id === active.id);
    const newIdx = timelineItems.findIndex((item) => item.data.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(timelineItems, oldIdx, newIdx);
    setOptimisticOrder(reordered.map((item) => item.data.id));
    onReorderDayItems(
      dayNumber,
      reordered.filter((item) => !isLinkedTimelineEvent(item)).map((item) => ({ type: item.kind, id: item.data.id }))
    );
  }

  const activeItem = activeId !== null ? timelineItems.find((item) => item.data.id === activeId) : undefined;

  function isLinkedTimelineEvent(item: TimelineItem): boolean {
    return item.kind === "event" && !!item.data.linkedReservationId;
  }

  function insertPositionAfter(idx: number): number {
    for (let index = idx; index >= 0; index--) {
      const candidate = timelineItems[index];
      if (!isLinkedTimelineEvent(candidate)) return candidate.position + 1;
    }
    return 0;
  }

  return (
    <DndContext
      id={`day-${dayNumber}`}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={timelineItems
          .filter((item) => !(item.kind === "event" && item.data.linkedReservationId))
          .map((item) => item.data.id)}
        strategy={verticalListSortingStrategy}
      >
        {renderEntries.map((entry, renderIdx) => {
          const isLast = renderIdx === renderEntries.length - 1;
          const key = entry.type === "draft" ? "draft" : entry.item.data.id;

          return (
            <div key={key}>
              {entry.type === "draft" ? (
                entry.draftKind === ItineraryItemType.Checklist ? (
                  <ChecklistItem
                    checklist={{
                      id: "draft",
                      tripDayId: dayId ?? "",
                      position: draftInsertAtPosition ?? 0,
                      items: [],
                    }}
                    isDraft
                    onCommitDraft={(firstItemContent) => {
                      onAddChecklist?.(dayNumber, draftInsertAtPosition ?? 0, firstItemContent);
                      cancelDraft();
                    }}
                    onCancelDraft={cancelDraft}
                  />
                ) : entry.draftKind === ItineraryItemType.Note ? (
                  <NoteItem
                    note={{ id: "draft", content: "", position: draftInsertAtPosition ?? 0 }}
                    isDraft
                    onCreate={commitDraft}
                    onCancelDraft={cancelDraft}
                  />
                ) : (
                  <PlaceRow
                    place={{ id: "draft", name: "", position: 0 }}
                    defaultCurrency={defaultExpenseCurrency}
                    dayDate={dayDate}
                    isDraft
                    onCreate={commitDraft}
                    onCancelDraft={cancelDraft}
                    onUpdate={() => {}}
                    onDelete={cancelDraft}
                  />
                )
              ) : entry.item.kind === "checklist" ? (
                <SortableChecklistItem
                  checklist={entry.item.data}
                  initiallyExpanded={entry.item.data.id === newlyCreatedChecklistId}
                  onTitleUpdate={onUpdateChecklistTitle}
                  onDelete={onDeleteChecklist}
                  onAddItem={onAddChecklistItem}
                  onUpdateItem={onUpdateChecklistItem}
                  onDeleteItem={onDeleteChecklistItem}
                  onToggleItem={onToggleChecklistItem}
                />
              ) : entry.item.kind === "event" ? (
                entry.item.data.linkedReservationId ? (
                  <PlaceRow
                    place={entry.item.data}
                    defaultCurrency={defaultExpenseCurrency}
                    dayDate={dayDate}
                    isLast={isLast}
                    onUpdate={onUpdateEvent}
                    onDelete={onDeleteEvent}
                    tripDocs={tripDocs}
                    onLinkedEventTap={onLinkedEventTap}
                  />
                ) : (
                  <SortablePlaceRow
                    id={`event-${entry.item.data.id}`}
                    place={entry.item.data}
                    defaultCurrency={defaultExpenseCurrency}
                    dayDate={dayDate}
                    isLast={isLast}
                    onUpdate={onUpdateEvent}
                    onDelete={onDeleteEvent}
                    tripDocs={tripDocs}
                    isHighlighted={entry.item.data.id === highlightedEventId}
                  />
                )
              ) : (
                <SortableNoteItem note={entry.item.data} onUpdate={onUpdateNote} onDelete={onDeleteNote} />
              )}
              {!isLast && entry.type === "timeline" && (
                <GapZone {...makeGapProps(`ti-${entry.idx}`, insertPositionAfter(entry.idx))} />
              )}
              {!isLast && entry.type === "draft" && <div style={{ height: 28 }} />}
            </div>
          );
        })}
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          activeItem.kind === "event" ? (
            <PlaceRow
              place={activeItem.data}
              defaultCurrency={defaultExpenseCurrency}
              dayDate={dayDate}
              onUpdate={() => {}}
              onDelete={() => {}}
            />
          ) : activeItem.kind === "note" ? (
            <NoteItem note={activeItem.data} displayOnly />
          ) : (
            <ChecklistItem checklist={activeItem.data} displayOnly />
          )
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
