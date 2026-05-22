"use client";

import { CalendarDays, MapPin, FileText, ListChecks } from "lucide-react";
import { DayCard } from "@/components/packt/day-card";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { type DayItinerary, type TripEvent, type DayItemType, type Document } from "@/data/types";

export interface TripItineraryViewProps {
  days: DayItinerary[];
  dateFormat?: string;
  tripDocs?: Document[];
  onUpdateEvent: (event: TripEvent) => void;
  onDeleteEvent: (id: string) => void;
  onReorderDayItems: (dayNumber: number, orderedItems: { type: DayItemType; id: string }[]) => void;
  onUpdateDay: (dayNumber: number, updates: Partial<DayItinerary>) => void;
  onAddEvent: (dayNumber: number, name: string, afterEventId?: string, insertAtPosition?: number) => void;
  onAddNote: (dayNumber: number, content: string, insertAtPosition?: number) => void;
  onUpdateNote: (noteId: string, content: string) => void;
  onDeleteNote: (noteId: string) => void;
  onAddChecklist: (dayNumber: number, insertAtPosition: number, firstItemContent?: string) => void;
  newlyCreatedChecklistId?: string;
  onUpdateChecklistTitle: (checklistId: string, title: string | undefined) => void;
  onDeleteChecklist: (checklistId: string) => void;
  onAddChecklistItem: (checklistId: string, content: string) => void;
  onUpdateChecklistItem: (itemId: string, content: string) => void;
  onDeleteChecklistItem: (itemId: string) => void;
  onToggleChecklistItem: (itemId: string) => void;
}

export function TripItineraryView({
  days,
  dateFormat,
  tripDocs,
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
}: TripItineraryViewProps) {
  if (days.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarDays strokeWidth={1.5} />
          </EmptyMedia>
          <EmptyTitle>No itinerary yet</EmptyTitle>
          <EmptyDescription>Start building your plan — add events, notes, or checklists.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={() => onAddEvent(1, "")} title="Add event">
            <MapPin strokeWidth={1.5} /> Add event
          </Button>
          <Button variant="outline" onClick={() => onAddNote(1, "")} title="Add note">
            <FileText strokeWidth={1.5} /> Add note
          </Button>
          <Button variant="outline" onClick={() => onAddChecklist(1, 0)} title="Add checklist">
            <ListChecks strokeWidth={1.5} /> Add checklist
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div>
      {days.map((day) => (
        <DayCard
          key={day.dayNumber}
          day={day}
          dateFormat={dateFormat}
          tripDocs={tripDocs}
          onUpdateEvent={onUpdateEvent}
          onDeleteEvent={onDeleteEvent}
          onReorderDayItems={onReorderDayItems}
          onUpdateDay={onUpdateDay}
          onAddEvent={onAddEvent}
          onAddNote={onAddNote}
          onUpdateNote={onUpdateNote}
          onDeleteNote={onDeleteNote}
          onAddChecklist={onAddChecklist}
          newlyCreatedChecklistId={newlyCreatedChecklistId}
          onUpdateChecklistTitle={onUpdateChecklistTitle}
          onDeleteChecklist={onDeleteChecklist}
          onAddChecklistItem={onAddChecklistItem}
          onUpdateChecklistItem={onUpdateChecklistItem}
          onDeleteChecklistItem={onDeleteChecklistItem}
          onToggleChecklistItem={onToggleChecklistItem}
        />
      ))}
    </div>
  );
}
