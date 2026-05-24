"use client";

import { TripItineraryView } from "./trip-itinerary-view";
import { TripDocsTab } from "@/components/packt/trip-docs-tab";
import { type DayItinerary, type TripEvent, type DayItemType, type Document, type TripDetailTab } from "@/data/types";

export interface TripDetailTabBodyProps {
  tripId: string;
  activeTab: TripDetailTab;
  days: DayItinerary[];
  docs: Document[];
  dateFormat: string;
  initialExpandedDayNumber?: number;
  newlyCreatedChecklistId?: string;
  onUpdateEvent: (event: TripEvent) => void;
  onDeleteEvent: (id: string) => void;
  onReorderDayItems: (dayNumber: number, orderedItems: { type: DayItemType; id: string }[]) => void;
  onUpdateDay: (dayNumber: number, updates: Partial<DayItinerary>) => void;
  onAddEvent: (dayNumber: number, name: string, afterEventId?: string, insertAtPosition?: number) => void;
  onAddNote: (dayNumber: number, content: string, insertAtPosition?: number) => void;
  onUpdateNote: (noteId: string, content: string) => void;
  onDeleteNote: (noteId: string) => void;
  onAddChecklist: (dayNumber: number, insertAtPosition: number, firstItemContent?: string) => void;
  onUpdateChecklistTitle: (checklistId: string, title: string | undefined) => void;
  onDeleteChecklist: (checklistId: string) => void;
  onAddChecklistItem: (checklistId: string, content: string) => void;
  onUpdateChecklistItem: (itemId: string, content: string) => void;
  onDeleteChecklistItem: (itemId: string) => void;
  onToggleChecklistItem: (itemId: string) => void;
}

export function TripDetailTabBody({
  tripId,
  activeTab,
  days,
  docs,
  dateFormat,
  initialExpandedDayNumber,
  newlyCreatedChecklistId,
  onUpdateEvent,
  onDeleteEvent,
  onReorderDayItems,
  onUpdateDay,
  onAddEvent,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onAddChecklist,
  onUpdateChecklistTitle,
  onDeleteChecklist,
  onAddChecklistItem,
  onUpdateChecklistItem,
  onDeleteChecklistItem,
  onToggleChecklistItem,
}: TripDetailTabBodyProps) {
  return (
    <>
      {activeTab === "itin" && (
        <TripItineraryView
          days={days}
          dateFormat={dateFormat}
          initialExpandedDayNumber={initialExpandedDayNumber}
          tripDocs={docs.filter((d) => d.scope === "trip")}
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
      )}
      {activeTab === "docs" && <TripDocsTab tripId={tripId} docs={docs.filter((d) => d.scope === "trip")} />}
      {activeTab === "map" && (
        <div style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--fg-2)" }}>Map view coming soon.</div>
      )}
      {activeTab === "pack" && (
        <div style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--fg-2)" }}>
          Packing list view coming soon.
        </div>
      )}
      {activeTab === "notes" && (
        <div style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--fg-2)" }}>Notes coming soon.</div>
      )}
    </>
  );
}
