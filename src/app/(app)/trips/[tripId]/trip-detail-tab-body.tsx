"use client";

import { useMemo } from "react";
import type { ReactElement } from "react";
import { TripItineraryView } from "./trip-itinerary-view";
import { TripDocsTab } from "@/components/packt/trip-docs-tab";
import { TripBudgetTab } from "@/components/packt/trip-budget-tab";
import { PackingListsView } from "@/components/packt/packing-lists-view";
import { ReservationsTab } from "@/components/packt/reservations-tab";
import { MapTab } from "@/components/packt/map-tab";
import { TripNotesTab } from "@/components/packt/trip-notes-tab";
import { TransitMode } from "@/data/types";
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
  TripNote,
  TripPackingList,
} from "@/data/types";

export interface TripDetailTabBodyProps {
  tripId: string;
  trip: Trip;
  defaultExpenseCurrency?: string;
  warningThreshold?: number;
  dangerThreshold?: number;
  walkThresholdMeters?: number | null;
  activeTab: TripDetailTab;
  days: DayItinerary[];
  unscheduledEvents: TripEvent[];
  docs: Document[];
  packingItems: PackingItem[];
  packingLists: TripPackingList[];
  reservations: Reservation[];
  expenses: Expense[];
  notes: TripNote[];
  templates: PackingTemplate[];
  dateFormat: string;
  initialExpandedDayNumber?: number;
  highlightedEventId?: string | null;
  isNew?: boolean;
  newlyCreatedChecklistId?: string;
  onUpdateEvent: (event: TripEvent) => void;
  onDeleteEvent: (id: string) => void;
  onReorderDayItems: (dayNumber: number, orderedItems: { type: DayItemType; id: string }[]) => void;
  onUpdateDay: (dayNumber: number, updates: Partial<DayItinerary>) => Promise<void>;
  onAddEvent: (dayNumber: number, name: string, afterEventId?: string, insertAtPosition?: number) => Promise<void>;
  onAddNote: (dayNumber: number, content: string, insertAtPosition?: number) => Promise<void>;
  onUpdateNote: (noteId: string, content: string) => void;
  onDeleteNote: (noteId: string) => void;
  onAddChecklist: (dayNumber: number, insertAtPosition: number, firstItemContent?: string) => Promise<void>;
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
  onOpenMapTab?: (dayNumber: number) => void;
  onEditExpense?: (expense: Expense) => void;
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
  warningThreshold,
  dangerThreshold,
  walkThresholdMeters,
  activeTab,
  days,
  unscheduledEvents,
  docs,
  packingItems,
  packingLists,
  reservations,
  expenses,
  notes,
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
  onOpenMapTab,
  onEditExpense,
  onAddDay,
  onRemoveLastDay,
  addingDay,
  removingDay,
}: TripDetailTabBodyProps): ReactElement {
  const allEvents = useMemo(
    () => days.flatMap((day) => day.events).concat(unscheduledEvents),
    [days, unscheduledEvents]
  );

  return (
    <>
      {activeTab === "itin" && (
        <TripItineraryView
          days={days}
          tripId={tripId}
          tripTransitMode={trip.transitMode ?? TransitMode.Drive}
          walkThresholdMeters={walkThresholdMeters}
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
          onOpenMapTab={onOpenMapTab}
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
          events={allEvents}
          reservations={reservations}
          dateFormat={dateFormat}
          defaultExpenseCurrency={defaultExpenseCurrency}
          warningThreshold={warningThreshold}
          dangerThreshold={dangerThreshold}
          onOpenEditBudget={onOpenEditBudget}
          onEditExpense={onEditExpense}
        />
      )}
      {activeTab === "map" && (
        <MapTab
          events={allEvents}
          reservations={reservations}
          tripId={tripId}
          days={days}
          unscheduledEvents={unscheduledEvents}
        />
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
      {activeTab === "notes" && <TripNotesTab tripId={tripId} notes={notes} />}
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
