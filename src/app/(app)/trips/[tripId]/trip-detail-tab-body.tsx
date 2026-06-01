"use client";

import type { ReactElement } from "react";
import { TripItineraryView } from "./trip-itinerary-view";
import { TripDocsTab } from "@/components/packt/trip-docs-tab";
import { PackingListView } from "@/components/packt/packing-list-view";
import type { DayItinerary, TripEvent, DayItemType, Document, PackingItem, TripDetailTab } from "@/data/types";

export interface TripDetailTabBodyProps {
  tripId: string;
  activeTab: TripDetailTab;
  days: DayItinerary[];
  unscheduledEvents: TripEvent[];
  docs: Document[];
  packingItems: PackingItem[];
  dateFormat: string;
  initialExpandedDayNumber?: number;
  isNew?: boolean;
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
  onAddPackingItem: (name: string, isLabel?: boolean) => void;
  onRemovePackingItem: (id: string) => void;
  onTogglePackingItem: (id: string) => Promise<void>;
  onAddDay: () => void;
  onRemoveLastDay: (
    confirmedDestructiveRemoval: boolean,
    onConfirmationRequired: (hasPlannedContent: boolean, removesOnlyDay: boolean) => void
  ) => void;
  addingDay: boolean;
  removingDay: boolean;
}

export function TripDetailTabBody({
  tripId,
  activeTab,
  days,
  unscheduledEvents,
  docs,
  packingItems,
  dateFormat,
  initialExpandedDayNumber,
  isNew,
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
  onAddPackingItem,
  onRemovePackingItem,
  onTogglePackingItem,
  onAddDay,
  onRemoveLastDay,
  addingDay,
  removingDay,
}: TripDetailTabBodyProps): ReactElement {
  return (
    <>
      {activeTab === "itin" && (
        <TripItineraryView
          days={days}
          unscheduledEvents={unscheduledEvents}
          dateFormat={dateFormat}
          initialExpandedDayNumber={initialExpandedDayNumber}
          isNew={isNew}
          tripDocs={docs.filter((document) => document.scope === "trip")}
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
          onAddDay={onAddDay}
          onRemoveLastDay={onRemoveLastDay}
          addingDay={addingDay}
          removingDay={removingDay}
        />
      )}
      {activeTab === "docs" && (
        <TripDocsTab tripId={tripId} docs={docs.filter((document) => document.scope === "trip")} />
      )}
      {activeTab === "map" && (
        <div style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--fg-2)" }}>Map view coming soon.</div>
      )}
      {activeTab === "pack" && (
        <PackingListView
          tripId={tripId}
          items={packingItems}
          onAddItem={onAddPackingItem}
          onRemoveItem={onRemovePackingItem}
          onToggleItem={onTogglePackingItem}
        />
      )}
      {activeTab === "notes" && (
        <div style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--fg-2)" }}>Notes coming soon.</div>
      )}
    </>
  );
}
