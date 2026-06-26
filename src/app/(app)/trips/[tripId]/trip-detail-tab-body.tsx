"use client";

import type { ReactElement } from "react";
import { TripItineraryView } from "./trip-itinerary-view";
import { TripDocsTab } from "@/components/packt/trip-docs-tab";
import { TripBudgetTab } from "@/components/packt/trip-budget-tab";
import { PackingListsView } from "@/components/packt/packing-lists-view";
import { ReservationsTab } from "@/components/packt/reservations-tab";
import type {
  DayItinerary,
  TripEvent,
  DayItemType,
  Document,
  Expense,
  PackingItem,
  PackingTemplate,
  PullTemplatesResult,
  RemovePackingSectionInput,
  Reservation,
  TripDetailTab,
  Trip,
  TripPackingList,
} from "@/data/types";

export interface TripDetailTabBodyProps {
  tripId: string;
  trip: Trip;
  defaultExpenseCurrency?: string;
  activeTab: TripDetailTab;
  days: DayItinerary[];
  unscheduledEvents: TripEvent[];
  docs: Document[];
  packingItems: PackingItem[];
  packingLists: TripPackingList[];
  reservations: Reservation[];
  expenses: Expense[];
  templates: PackingTemplate[];
  dateFormat: string;
  initialExpandedDayNumber?: number;
  highlightedEventId?: string | null;
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
  onAddPackingItem: (
    name: string,
    isLabel?: boolean,
    afterItemId?: string,
    beforeItemId?: string,
    labelId?: string | null,
    listId?: string | null
  ) => Promise<void>;
  onRemovePackingItem: (id: string) => Promise<void>;
  onRemovePackingSection: (id: string, input: RemovePackingSectionInput) => Promise<void>;
  onTogglePackingItem: (id: string) => Promise<void>;
  onReorderPackingItems: (
    ordered: { id: string; labelId: string | null; position: number }[],
    onError?: () => void
  ) => void;
  onEditPackingItem: (id: string, name: string) => void;
  onPullTemplates: (templateIds: string[]) => Promise<PullTemplatesResult | undefined>;
  onSaveAsTemplate?: (name: string) => Promise<string | undefined>;
  onCreatePackingList: (name: string) => Promise<string | undefined>;
  onRenamePackingList: (listId: string, name: string) => Promise<void>;
  onDeletePackingList: (listId: string) => Promise<void>;
  onInsertFromPackingSource: (
    dayNumber: number,
    position: number,
    sourceType: "packing-list" | "template",
    sourceId: string
  ) => Promise<void>;
  isDateless: boolean;
  onOpenEditDates: () => void;
  onOpenEditBudget: () => void;
  onActivateReservationsCta: () => void;
  onLinkedEventTap: (linkedReservationId: string) => void;
  onAddDay: () => void;
  onRemoveLastDay: (
    confirmedDestructiveRemoval: boolean,
    onConfirmationRequired: (hasPlannedContent: boolean) => void
  ) => void;
  addingDay: boolean;
  removingDay: boolean;
}

export function TripDetailTabBody({
  tripId,
  trip,
  defaultExpenseCurrency,
  activeTab,
  days,
  unscheduledEvents,
  docs,
  packingItems,
  packingLists,
  reservations,
  expenses,
  templates,
  dateFormat,
  initialExpandedDayNumber,
  highlightedEventId,
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
  onRemovePackingSection,
  onTogglePackingItem,
  onReorderPackingItems,
  onEditPackingItem,
  onPullTemplates,
  onSaveAsTemplate,
  onCreatePackingList,
  onRenamePackingList,
  onDeletePackingList,
  onInsertFromPackingSource,
  isDateless,
  onOpenEditDates,
  onOpenEditBudget,
  onActivateReservationsCta,
  onLinkedEventTap,
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
          defaultExpenseCurrency={defaultExpenseCurrency}
          dateFormat={dateFormat}
          initialExpandedDayNumber={initialExpandedDayNumber}
          highlightedEventId={highlightedEventId}
          isNew={isNew}
          tripDocs={docs.filter((document) => document.scope === "trip")}
          packingLists={packingLists}
          templates={templates}
          onInsertFromPackingSource={onInsertFromPackingSource}
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
          isDateless={isDateless}
          onOpenEditDates={onOpenEditDates}
          reservationCount={reservations.length}
          onActivateReservationsCta={onActivateReservationsCta}
          onLinkedEventTap={onLinkedEventTap}
          onAddDay={onAddDay}
          onRemoveLastDay={onRemoveLastDay}
          addingDay={addingDay}
          removingDay={removingDay}
        />
      )}
      {activeTab === "docs" && (
        <TripDocsTab tripId={tripId} docs={docs.filter((document) => document.scope === "trip")} />
      )}
      {activeTab === "budget" && (
        <TripBudgetTab
          tripId={tripId}
          budget={trip.budget}
          expenses={expenses}
          defaultExpenseCurrency={defaultExpenseCurrency}
          onOpenEditBudget={onOpenEditBudget}
        />
      )}
      {activeTab === "map" && (
        <div style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--fg-2)" }}>Map view coming soon.</div>
      )}
      {activeTab === "pack" && (
        <PackingListsView
          tripId={tripId}
          packingLists={packingLists}
          packingItems={packingItems}
          templates={templates}
          onAddItem={(name, isLabel, afterItemId, beforeItemId, labelId, listId) =>
            onAddPackingItem(name, isLabel, afterItemId, beforeItemId, labelId, listId)
          }
          onRemoveItem={onRemovePackingItem}
          onRemoveSection={onRemovePackingSection}
          onToggleItem={onTogglePackingItem}
          onReorderItems={onReorderPackingItems}
          onEditItem={onEditPackingItem}
          onPullTemplates={onPullTemplates}
          onSaveAsTemplate={onSaveAsTemplate}
          onCreateList={onCreatePackingList}
          onRenameList={onRenamePackingList}
          onDeleteList={onDeletePackingList}
        />
      )}
      {activeTab === "notes" && (
        <div style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--fg-2)" }}>Notes coming soon.</div>
      )}
      {activeTab === "res" && (
        <ReservationsTab
          tripId={tripId}
          reservations={reservations}
          defaultExpenseCurrency={defaultExpenseCurrency}
          tripDocs={docs.filter((document) => document.scope === "trip")}
          isDateless={isDateless}
          onOpenEditDates={onOpenEditDates}
        />
      )}
    </>
  );
}
