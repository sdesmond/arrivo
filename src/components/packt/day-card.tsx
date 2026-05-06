"use client";

import { useState } from "react";
import { MapPin, Plus, ChevronDown, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PlaceRow } from "./place-row";
import { type DayItinerary, type TripEvent } from "@/data/types";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface DayCardProps {
  day: DayItinerary;
  onUpdateEvent: (event: TripEvent) => void;
  onDeleteEvent: (id: string) => void;
  onReorderEvents: (dayNumber: number, events: TripEvent[]) => void;
  onUpdateDay?: (dayNumber: number, updates: Partial<DayItinerary>) => void;
}

function SortablePlaceRow(props: React.ComponentProps<typeof PlaceRow>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.place.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const dragHandle = (
    <span
      {...attributes}
      {...listeners}
      style={{ cursor: "grab", display: "flex", alignItems: "center", touchAction: "none" }}
    >
      <GripVertical size={13} strokeWidth={1.5} />
    </span>
  );
  return (
    <div ref={setNodeRef} style={style}>
      <PlaceRow {...props} dragHandle={dragHandle} />
    </div>
  );
}

export function DayCard({ day: d, onUpdateEvent, onDeleteEvent, onReorderEvents, onUpdateDay }: DayCardProps) {
  const isToday = d.date
    ? (() => {
        const dayDate = new Date(d.date + "T12:00:00");
        const now = new Date();
        return (
          dayDate.getFullYear() === now.getFullYear() &&
          dayDate.getMonth() === now.getMonth() &&
          dayDate.getDate() === now.getDate()
        );
      })()
    : !!d.today;
  const [open, setOpen] = useState(isToday);
  const [isEditingSubtitle, setIsEditingSubtitle] = useState(false);
  const [draftSubtitle, setDraftSubtitle] = useState(d.subtitle ?? "");

  const dateDisplay = d.date
    ? new Date(d.date + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric",
      })
    : d.label.replace(" · ", ", ");

  function saveSubtitle() {
    const val = draftSubtitle.trim() || undefined;
    if (val !== d.subtitle) onUpdateDay?.(d.dayNumber, { subtitle: val });
    setIsEditingSubtitle(false);
  }

  const scheduledEvents   = d.events.filter((e) => !!e.time);
  const unscheduledEvents = d.events.filter((e) => !e.time);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleUnscheduledDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const oldIdx = unscheduledEvents.findIndex(e => e.id === active.id);
    const newIdx = unscheduledEvents.findIndex(e => e.id === over.id);
    onReorderEvents(d.dayNumber, [...arrayMove(unscheduledEvents, oldIdx, newIdx), ...scheduledEvents]);
  }

  function handleScheduledDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const oldIdx = scheduledEvents.findIndex(e => e.id === active.id);
    const newIdx = scheduledEvents.findIndex(e => e.id === over.id);
    onReorderEvents(d.dayNumber, [...unscheduledEvents, ...arrayMove(scheduledEvents, oldIdx, newIdx)]);
  }

  return (
    <div
      className="rounded-[10px] mb-4"
      style={{
        border: isToday ? "1.5px solid var(--accent-brand)" : "1px solid var(--line)",
        background: "var(--bg)",
      }}
    >
      {/* Day header */}
      <div
        className={`rounded-t-[10px] ${!open ? "rounded-b-[10px]" : ""}`}
        style={{
          background: isToday ? "var(--accent-soft)" : "var(--surface)",
          borderBottom: open ? "1px solid var(--line)" : "none",
        }}
      >
        {/* Toggle row */}
        <button
          className="w-full flex items-center justify-between gap-3 px-4 pt-3 pb-1.5 text-left transition-colors hover:opacity-90"
          style={{ cursor: "pointer", background: "none", border: "none" }}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <div
            style={{
              fontFamily: "var(--font-heading-family, ui-sans-serif)",
              fontSize: 14, fontWeight: 600,
              color: "var(--fg)",
            }}
          >
            {dateDisplay}
          </div>
          <div className="flex items-center gap-2">
            <span
              className="flex items-center gap-1"
              style={{ fontSize: 12, color: "var(--fg-3)" }}
            >
              <MapPin size={12} strokeWidth={1.5} />
              {d.events.length} stops
            </span>
            {isToday && <Badge variant="soft">Active</Badge>}
            <ChevronDown
              size={14}
              strokeWidth={1.5}
              style={{
                color: "var(--fg-4)",
                transform: open ? "rotate(180deg)" : undefined,
                transition: "transform 0.15s",
                flexShrink: 0,
              }}
            />
          </div>
        </button>

        {/* Editable subtitle zone */}
        <div className="px-4 pb-2.5">
          {isEditingSubtitle ? (
            <input
              autoFocus
              value={draftSubtitle}
              placeholder="Add a note"
              onChange={e => setDraftSubtitle(e.target.value)}
              onBlur={saveSubtitle}
              onKeyDown={e => {
                if (e.key === "Enter") saveSubtitle();
                if (e.key === "Escape") { setDraftSubtitle(d.subtitle ?? ""); setIsEditingSubtitle(false); }
              }}
              style={{
                fontSize: 12, color: "var(--fg-3)",
                background: "transparent",
                border: "none",
                borderBottom: "1px solid var(--accent-brand)",
                outline: "none", width: "100%",
                fontFamily: "inherit",
                padding: "1px 0",
              }}
            />
          ) : (
            <div
              onClick={e => { e.stopPropagation(); setDraftSubtitle(d.subtitle ?? ""); setIsEditingSubtitle(true); }}
              style={{
                fontSize: 12,
                color: d.subtitle ? "var(--fg-3)" : "var(--fg-4)",
                cursor: "text",
                minHeight: "1.2em",
                width: "fit-content",
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {d.subtitle ?? "Add a note"}
            </div>
          )}
        </div>
      </div>

      {/* Collapsible body */}
      {open && (
        <div className="p-3 flex flex-col">
          {/* Day note */}
          {d.note && (
            <div
              className="rounded-[6px] px-3 py-2.5 mb-3"
              style={{
                fontSize: 12.5, color: "var(--fg-2)",
                background: "var(--surface-2)",
                borderLeft: "2px solid var(--accent-brand)",
              }}
            >
              <div style={{
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: 9, fontWeight: 600, letterSpacing: "0.08em",
                textTransform: "uppercase", color: "var(--fg-4)", marginBottom: 4,
              }}>
                DAY NOTES
              </div>
              {d.note}
            </div>
          )}

          {/* Unscheduled events */}
          {unscheduledEvents.length > 0 && (
            <div className="mb-2">
              <div style={{
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: 9, fontWeight: 600, letterSpacing: "0.08em",
                textTransform: "uppercase", color: "var(--fg-4)",
                marginBottom: 4, paddingLeft: 4,
              }}>
                Unscheduled
              </div>
              <DndContext id={`day-${d.dayNumber}-unscheduled`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleUnscheduledDragEnd}>
                <SortableContext items={unscheduledEvents.map(e => e.id)} strategy={verticalListSortingStrategy}>
                  {unscheduledEvents.map((p, i) => (
                    <SortablePlaceRow
                      key={p.id ?? i}
                      place={{ ...p, date: p.date ?? d.date }}
                      isLast={i === unscheduledEvents.length - 1 && scheduledEvents.length === 0}
                      onUpdate={e => onUpdateEvent({ ...e, date: e.date ?? d.date })}
                      onDelete={onDeleteEvent}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          )}

          {/* Scheduled events */}
          <DndContext id={`day-${d.dayNumber}-scheduled`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleScheduledDragEnd}>
            <SortableContext items={scheduledEvents.map(e => e.id)} strategy={verticalListSortingStrategy}>
              {scheduledEvents.map((p, i) => (
                <SortablePlaceRow
                  key={p.id ?? i}
                  place={{ ...p, date: p.date ?? d.date }}
                  isLast={i === scheduledEvents.length - 1}
                  onUpdate={e => onUpdateEvent({ ...e, date: e.date ?? d.date })}
                  onDelete={onDeleteEvent}
                />
              ))}
            </SortableContext>
          </DndContext>

          {/* Add place button */}
          <button
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
        </div>
      )}
    </div>
  );
}
