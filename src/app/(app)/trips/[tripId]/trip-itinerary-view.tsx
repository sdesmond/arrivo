"use client";

import { useState } from "react";
import type { ReactElement } from "react";
import { CalendarDays, Plus } from "lucide-react";
import { DayCard } from "@/components/packt/day-card";
import { Button } from "@/components/ui/button";
import { PackingListPickerDialog } from "@/components/packt/packing-list-picker-dialog";
import { ItineraryCta } from "@/components/packt/itinerary-cta";
import type {
  DayItinerary,
  TripEvent,
  DayItemType,
  Document,
  TripPackingList,
  PackingTemplate,
  TransitMode,
} from "@/data/types";
import { useCanEditTrip } from "@/components/packt/trip-edit-access";
import { UnscheduledEventsSection } from "./unscheduled-events-section";
import { RemoveLastDayDialog } from "./remove-last-day-dialog";

export interface TripItineraryViewProps {
  days: DayItinerary[];
  tripId?: string;
  tripTransitMode?: TransitMode | null;
  walkThresholdMeters?: number | null;
  unscheduledEvents: TripEvent[];
  defaultExpenseCurrency?: string;
  isDateless: boolean;
  onOpenEditDates: () => void;
  reservationCount: number;
  onActivateReservationsCta: () => void;
  onLinkedEventTap: (linkedReservationId: string) => void;
  onOpenMapTab?: (dayNumber: number) => void;
  dateFormat?: string;
  initialExpandedDayNumber?: number;
  highlightedEventId?: string | null;
  isNew?: boolean;
  tripDocs?: Document[];
  packingLists: TripPackingList[];
  templates: PackingTemplate[];
  onInsertFromPackingSource: (
    dayNumber: number,
    position: number,
    sourceType: "packing-list" | "template",
    sourceId: string
  ) => Promise<void>;
  onUpdateEvent: (event: TripEvent) => void;
  onDeleteEvent: (id: string) => void;
  onReorderDayItems: (dayNumber: number, orderedItems: { type: DayItemType; id: string }[]) => void;
  onUpdateDay: (dayNumber: number, updates: Partial<DayItinerary>) => Promise<void>;
  onAddEvent: (dayNumber: number, name: string, afterEventId?: string, insertAtPosition?: number) => Promise<void>;
  onAddNote: (dayNumber: number, content: string, insertAtPosition?: number) => Promise<void>;
  onUpdateNote: (noteId: string, content: string) => void;
  onDeleteNote: (noteId: string) => void;
  onAddChecklist: (dayNumber: number, insertAtPosition: number, firstItemContent?: string) => Promise<void>;
  newlyCreatedChecklistId?: string;
  onUpdateChecklistTitle: (checklistId: string, title: string | undefined) => void;
  onDeleteChecklist: (checklistId: string) => void;
  onAddChecklistItem: (checklistId: string, content: string) => void;
  onUpdateChecklistItem: (itemId: string, content: string) => void;
  onDeleteChecklistItem: (itemId: string) => void;
  onToggleChecklistItem: (itemId: string) => void;
  onAddDay: () => void;
  onRemoveLastDay: (
    confirmedDestructiveRemoval: boolean,
    onConfirmationRequired: (hasPlannedContent: boolean) => void
  ) => void;
  addingDay: boolean;
  removingDay: boolean;
}

interface RemovalConfirmation {
  hasPlannedContent: boolean;
}

interface PickerState {
  dayNumber: number;
  insertAtPosition: number;
}

export function TripItineraryView({
  days,
  unscheduledEvents,
  defaultExpenseCurrency,
  isDateless,
  onOpenEditDates,
  reservationCount,
  onActivateReservationsCta,
  onLinkedEventTap,
  onOpenMapTab,
  dateFormat,
  initialExpandedDayNumber,
  highlightedEventId,
  isNew,
  tripDocs,
  packingLists,
  templates,
  onInsertFromPackingSource,
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
  onAddDay,
  onRemoveLastDay,
  addingDay,
  removingDay,
  tripId,
  tripTransitMode,
  walkThresholdMeters,
}: TripItineraryViewProps): ReactElement {
  const canEdit = useCanEditTrip();
  const [removalConfirmation, setRemovalConfirmation] = useState<RemovalConfirmation | null>(null);
  const [initialRenderDayCount] = useState(() => days.length);
  const [pickerState, setPickerState] = useState<PickerState | null>(null);

  const lastDay = days.at(-1);
  const lastDayHasPlannedContent =
    lastDay !== undefined &&
    (lastDay.events.length > 0 || (lastDay.notes?.length ?? 0) > 0 || (lastDay.checklists?.length ?? 0) > 0);

  function requireRemovalConfirmation(hasPlannedContent: boolean): void {
    setRemovalConfirmation({ hasPlannedContent });
  }

  function requestLastDayRemoval(): void {
    if (!lastDay) return;
    if (lastDayHasPlannedContent) {
      requireRemovalConfirmation(true);
      return;
    }
    onRemoveLastDay(false, requireRemovalConfirmation);
  }

  function confirmLastDayRemoval(): void {
    onRemoveLastDay(true, requireRemovalConfirmation);
    setRemovalConfirmation(null);
  }

  async function handlePickerSelect(sourceType: "packing-list" | "template", sourceId: string): Promise<void> {
    if (!pickerState) return;
    setPickerState(null);
    await onInsertFromPackingSource(pickerState.dayNumber, pickerState.insertAtPosition, sourceType, sourceId);
  }

  return (
    <>
      <div>
        {canEdit && isDateless && (
          <div className="flex items-center mb-4">
            <Button
              variant="outline"
              size="sm"
              className="shadow-sm"
              style={{
                background: "var(--accent-soft)",
                borderColor: "var(--accent-brand)",
                color: "var(--accent-ink)",
              }}
              onClick={onOpenEditDates}
            >
              <CalendarDays strokeWidth={1.5} />
              Set trip dates
            </Button>
          </div>
        )}
        <UnscheduledEventsSection
          unscheduledEvents={unscheduledEvents}
          defaultExpenseCurrency={defaultExpenseCurrency}
          dateFormat={dateFormat}
          tripDocs={tripDocs}
          onUpdateEvent={onUpdateEvent}
          onDeleteEvent={onDeleteEvent}
        />
        {canEdit && <ItineraryCta reservationCount={reservationCount} onActivate={onActivateReservationsCta} />}
        {days.map((day, index) => {
          const canRemove = canEdit && days.length > 1 && day.dayNumber === lastDay?.dayNumber;
          const dayCard = (
            <DayCard
              key={day.dayNumber}
              day={day}
              tripId={tripId}
              tripTransitMode={tripTransitMode}
              walkThresholdMeters={walkThresholdMeters}
              defaultExpenseCurrency={defaultExpenseCurrency}
              dateFormat={dateFormat}
              initialOpen={initialExpandedDayNumber === day.dayNumber}
              highlightedEventId={highlightedEventId}
              tripDocs={tripDocs}
              onUpdateEvent={onUpdateEvent}
              onDeleteEvent={onDeleteEvent}
              onLinkedEventTap={onLinkedEventTap}
              onOpenMapTab={onOpenMapTab}
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
              onRemove={canRemove ? requestLastDayRemoval : undefined}
              removeDisabled={removingDay || addingDay}
              onOpenPackingListPicker={(insertAtPosition) =>
                setPickerState({ dayNumber: day.dayNumber, insertAtPosition })
              }
            />
          );

          if (!(isNew === true && index < initialRenderDayCount)) {
            return dayCard;
          }

          return (
            <div
              key={day.dayNumber}
              data-testid={`day-card-stagger-${day.dayNumber}`}
              className="animate-in fade-in slide-in-from-bottom-4 fill-mode-backwards duration-300"
              style={{ animationDelay: `${index * 160}ms` }}
            >
              {dayCard}
            </div>
          );
        })}
        {canEdit && (
          <Button className="min-h-11 w-full sm:w-auto" onClick={onAddDay} disabled={addingDay || removingDay}>
            <Plus data-icon="inline-start" strokeWidth={1.5} />
            {addingDay ? "Adding Day..." : "Add Day"}
          </Button>
        )}
      </div>

      <PackingListPickerDialog
        open={pickerState !== null}
        onClose={() => setPickerState(null)}
        packingLists={packingLists}
        templates={templates}
        onSelect={handlePickerSelect}
      />

      <RemoveLastDayDialog
        open={removalConfirmation !== null}
        removingDay={removingDay}
        onCancel={() => setRemovalConfirmation(null)}
        onConfirm={confirmLastDayRemoval}
      />
    </>
  );
}
