"use client";

import { useState, useEffect, useMemo } from "react";
import { useNow } from "@/components/providers/mock-date-provider";
import { Plus } from "lucide-react";
import { PlaceRow } from "./place-row";
import { NoteItem } from "./note-item";
import { ChecklistItem } from "./checklist-item";
import { TypePicker } from "./type-picker";
import { SortablePlaceRow, SortableNoteItem, SortableChecklistItem } from "./day-card-sortables";
import { GapZone, type GapZoneProps } from "./gap-zone";
import { DayCardHeader } from "./day-card-header";
import {
  type DayItinerary,
  type TripEvent,
  type ItineraryNote,
  type Checklist,
  type DayItemType,
  ItineraryItemType,
} from "@/data/types";
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

interface DayCardProps {
  day: DayItinerary;
  onUpdateEvent: (event: TripEvent) => void;
  onDeleteEvent: (id: string) => void;
  onReorderDayItems: (dayNumber: number, orderedItems: { type: DayItemType; id: string }[]) => void;
  onUpdateDay?: (dayNumber: number, updates: Partial<DayItinerary>) => void;
  onAddEvent?: (dayNumber: number, name: string, afterEventId?: string, insertAtPosition?: number) => void;
  onAddNote?: (dayNumber: number, content: string, insertAtPosition?: number) => void;
  onUpdateNote?: (noteId: string, content: string) => void;
  onDeleteNote?: (noteId: string) => void;
  onAddDoc?: (eventId: string, input: { name: string; kind: string; url?: string; offline?: boolean }) => void;
  onDeleteDoc?: (docId: string) => void;
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

type TimelineItem =
  | { kind: "event"; data: TripEvent; position: number }
  | { kind: "note"; data: ItineraryNote; position: number }
  | { kind: "checklist"; data: Checklist; position: number };

// ── DayCard ───────────────────────────────────────────────────────────────────

export function DayCard({
  day: d,
  onUpdateEvent,
  onDeleteEvent,
  onReorderDayItems,
  onUpdateDay,
  onAddEvent,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onAddDoc,
  onDeleteDoc,
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

  const [open, setOpen] = useState(isToday);
  const [openGapKey, setOpenGapKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const dateDisplay = d.date
    ? new Date(d.date + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : d.label.replace(" · ", ", ");

  const [optimisticOrder, setOptimisticOrder] = useState<string[] | null>(null);

  const allEvents = d.events;
  const notes = d.notes ?? [];
  const checklists = d.checklists ?? [];

  const propTimelineItems: TimelineItem[] = [
    ...allEvents.map((e, i) => ({ kind: "event" as const, data: e, position: e.position ?? i })),
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
  type RenderEntry =
    | { type: "timeline"; item: TimelineItem; idx: number }
    | { type: "draft"; draftKind: ItineraryItemType };

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
    const oldIdx = timelineItems.findIndex((it) => it.data.id === active.id);
    const newIdx = timelineItems.findIndex((it) => it.data.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(timelineItems, oldIdx, newIdx);
    setOptimisticOrder(reordered.map((it) => it.data.id));
    onReorderDayItems(
      d.dayNumber,
      reordered.map((it) => ({ type: it.kind, id: it.data.id }))
    );
  }

  const activeItem = activeId !== null ? timelineItems.find((it) => it.data.id === activeId) : undefined;

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
          <DndContext
            id={`day-${d.dayNumber}`}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragCancel={handleDragCancel}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={timelineItems.map((it) => it.data.id)} strategy={verticalListSortingStrategy}>
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
                            tripDayId: d.id ?? "",
                            position: draft!.insertAtPosition,
                            items: [],
                          }}
                          isDraft
                          onCommitDraft={(firstItemContent) => {
                            onAddChecklist?.(d.dayNumber, draft!.insertAtPosition, firstItemContent);
                            setDraft(null);
                          }}
                          onCancelDraft={cancelDraft}
                        />
                      ) : entry.draftKind === ItineraryItemType.Note ? (
                        <NoteItem
                          note={{ id: "draft", content: "", position: draft!.insertAtPosition }}
                          isDraft
                          onCreate={commitDraft}
                          onCancelDraft={cancelDraft}
                        />
                      ) : (
                        <PlaceRow
                          place={{ id: "draft", name: "" }}
                          dayDate={d.date}
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
                      <SortablePlaceRow
                        id={`event-${entry.item.data.id}`}
                        place={entry.item.data}
                        dayDate={d.date}
                        isLast={isLast}
                        onUpdate={onUpdateEvent}
                        onDelete={onDeleteEvent}
                        onAddDoc={onAddDoc}
                        onDeleteDoc={onDeleteDoc}
                      />
                    ) : (
                      <SortableNoteItem note={entry.item.data} onUpdate={onUpdateNote} onDelete={onDeleteNote} />
                    )}
                    {!isLast && entry.type === "timeline" && (
                      <GapZone {...makeGapProps(`ti-${entry.idx}`, entry.item.position + 1)} />
                    )}
                    {!isLast && entry.type === "draft" && <div style={{ height: 28 }} />}
                  </div>
                );
              })}
            </SortableContext>
            <DragOverlay dropAnimation={null}>
              {activeItem ? (
                activeItem.kind === "event" ? (
                  <PlaceRow place={activeItem.data} dayDate={d.date} onUpdate={() => {}} onDelete={() => {}} />
                ) : activeItem.kind === "note" ? (
                  <NoteItem note={activeItem.data} displayOnly />
                ) : (
                  <ChecklistItem checklist={activeItem.data} displayOnly />
                )
              ) : null}
            </DragOverlay>
          </DndContext>

          {/* Bottom add */}
          {openGapKey === "bottom" ? (
            <div className="flex items-center mt-1" style={{ paddingLeft: 12, paddingTop: 4, paddingBottom: 4 }}>
              <TypePicker
                onSelect={(type) => activateDraft(type, bottomInsertPosition, "bottom")}
                onDismiss={() => setOpenGapKey(null)}
              />
            </div>
          ) : (
            <button
              onClick={() => openGap("bottom")}
              className="flex items-center gap-2 px-3 py-2 mt-1 rounded-[6px] transition-colors hover:bg-surface"
              style={{ fontSize: 12.5, color: "var(--fg-4)", border: "none", background: "none" }}
            >
              <span
                className="flex items-center justify-center rounded-full"
                style={{ width: 18, height: 18, background: "var(--surface-2)" }}
              >
                <Plus size={11} strokeWidth={2} />
              </span>
              Add a place to day {d.dayNumber}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
