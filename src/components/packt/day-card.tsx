"use client";

import { useState } from "react";
import type { ReactElement } from "react";
import { useNow } from "@/components/providers/mock-date-provider";
import { DayCardBody } from "./day-card-body";
import { DayCardHeader } from "./day-card-header";
import type { DayItinerary, TripEvent, DayItemType, Document } from "@/data/types";

interface DayCardProps {
  day: DayItinerary;
  defaultExpenseCurrency?: string;
  dateFormat?: string;
  tripDocs?: Document[];
  initialOpen?: boolean;
  onUpdateEvent: (event: TripEvent) => void;
  onDeleteEvent: (id: string) => void;
  onLinkedEventTap?: (linkedReservationId: string) => void;
  onReorderDayItems: (dayNumber: number, orderedItems: { type: DayItemType; id: string }[]) => void;
  onUpdateDay?: (dayNumber: number, updates: Partial<DayItinerary>) => void;
  onAddEvent?: (dayNumber: number, name: string, afterEventId?: string, insertAtPosition?: number) => void;
  onAddNote?: (dayNumber: number, content: string, insertAtPosition?: number) => void;
  onUpdateNote?: (noteId: string, content: string) => void;
  onDeleteNote?: (noteId: string) => void;
  onAddChecklist?: (dayNumber: number, insertAtPosition: number, firstItemContent?: string) => void;
  newlyCreatedChecklistId?: string;
  highlightedEventId?: string | null;
  onUpdateChecklistTitle?: (checklistId: string, title: string | undefined) => void;
  onDeleteChecklist?: (checklistId: string) => void;
  onAddChecklistItem?: (checklistId: string, content: string) => void;
  onUpdateChecklistItem?: (itemId: string, content: string) => void;
  onDeleteChecklistItem?: (itemId: string) => void;
  onToggleChecklistItem?: (itemId: string) => void;
  onRemove?: () => void;
  removeDisabled?: boolean;
  onOpenPackingListPicker?: (insertAtPosition: number) => void;
}

export function DayCard({
  day,
  defaultExpenseCurrency,
  dateFormat = "MM/DD/YYYY",
  tripDocs,
  initialOpen,
  onUpdateEvent,
  onDeleteEvent,
  onLinkedEventTap,
  onReorderDayItems,
  onUpdateDay,
  onAddEvent,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onAddChecklist,
  newlyCreatedChecklistId,
  highlightedEventId,
  onUpdateChecklistTitle,
  onDeleteChecklist,
  onAddChecklistItem,
  onUpdateChecklistItem,
  onDeleteChecklistItem,
  onToggleChecklistItem,
  onRemove,
  removeDisabled,
  onOpenPackingListPicker,
}: DayCardProps): ReactElement {
  const now = useNow();
  const isToday = day.date
    ? (() => {
        const dayDate = new Date(day.date + "T12:00:00");
        return (
          dayDate.getFullYear() === now.getFullYear() &&
          dayDate.getMonth() === now.getMonth() &&
          dayDate.getDate() === now.getDate()
        );
      })()
    : !!day.today;
  const [open, setOpen] = useState(initialOpen ?? isToday);

  const dateDisplay = day.date
    ? (() => {
        const date = new Date(day.date + "T12:00:00");
        const weekday = date.toLocaleString("en-US", { weekday: "short" });
        const calendarDay = date.getDate();
        const month = date.toLocaleString("en-US", { month: "short" });
        const datePart = dateFormat === "DD/MM/YYYY" ? `${calendarDay} ${month}` : `${month} ${calendarDay}`;
        return `${weekday}, ${datePart}`;
      })()
    : day.label.replace(" · ", ", ");

  return (
    <div
      className="mb-4"
      style={{
        borderRadius: 14,
        border: isToday ? "1.5px solid var(--accent-brand)" : "1px solid var(--line)",
        background: "var(--bg)",
      }}
    >
      <DayCardHeader
        dateDisplay={dateDisplay}
        isToday={isToday}
        stopsCount={day.events.length}
        subtitle={day.subtitle}
        open={open}
        onToggle={() => setOpen((value) => !value)}
        dayNumber={day.dayNumber}
        onUpdateDay={onUpdateDay}
        onRemove={onRemove}
        removeDisabled={removeDisabled}
      />
      {open && (
        <DayCardBody
          day={day}
          defaultExpenseCurrency={defaultExpenseCurrency}
          tripDocs={tripDocs}
          newlyCreatedChecklistId={newlyCreatedChecklistId}
          highlightedEventId={highlightedEventId}
          onReorderDayItems={onReorderDayItems}
          onUpdateEvent={onUpdateEvent}
          onDeleteEvent={onDeleteEvent}
          onLinkedEventTap={onLinkedEventTap}
          onAddEvent={onAddEvent}
          onAddNote={onAddNote}
          onUpdateNote={onUpdateNote}
          onDeleteNote={onDeleteNote}
          onAddChecklist={onAddChecklist}
          onUpdateChecklistTitle={onUpdateChecklistTitle}
          onDeleteChecklist={onDeleteChecklist}
          onAddChecklistItem={onAddChecklistItem}
          onUpdateChecklistItem={onUpdateChecklistItem}
          onDeleteChecklistItem={onDeleteChecklistItem}
          onToggleChecklistItem={onToggleChecklistItem}
          onOpenPackingListPicker={onOpenPackingListPicker}
        />
      )}
    </div>
  );
}
