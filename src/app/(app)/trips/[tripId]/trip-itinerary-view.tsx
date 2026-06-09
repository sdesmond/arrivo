"use client";

import { useState } from "react";
import type { ReactElement } from "react";
import { CalendarDays, Plus } from "lucide-react";
import { DayCard } from "@/components/packt/day-card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PackingListPickerDialog } from "@/components/packt/packing-list-picker-dialog";
import type { DayItinerary, TripEvent, DayItemType, Document, TripPackingList, PackingTemplate } from "@/data/types";
import { UnscheduledEventsSection } from "./unscheduled-events-section";

export interface TripItineraryViewProps {
  days: DayItinerary[];
  unscheduledEvents: TripEvent[];
  isDateless: boolean;
  onOpenEditDates: () => void;
  dateFormat?: string;
  initialExpandedDayNumber?: number;
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
  isDateless,
  onOpenEditDates,
  dateFormat,
  initialExpandedDayNumber,
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
}: TripItineraryViewProps): ReactElement {
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
        {isDateless && (
          <div className="flex items-center mb-4">
            <Button variant="outline" size="sm" onClick={onOpenEditDates}>
              <CalendarDays strokeWidth={1.5} />
              Set trip dates
            </Button>
          </div>
        )}
        <UnscheduledEventsSection
          unscheduledEvents={unscheduledEvents}
          dateFormat={dateFormat}
          tripDocs={tripDocs}
          onUpdateEvent={onUpdateEvent}
          onDeleteEvent={onDeleteEvent}
        />
        {days.map((day, index) => {
          const canRemove = days.length > 1 && day.dayNumber === lastDay?.dayNumber;
          const dayCard = (
            <DayCard
              key={day.dayNumber}
              day={day}
              dateFormat={dateFormat}
              initialOpen={initialExpandedDayNumber === day.dayNumber}
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
        {days.length > 0 && (
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

      <AlertDialog
        open={removalConfirmation !== null}
        onOpenChange={(open) => {
          if (!open) setRemovalConfirmation(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Day</AlertDialogTitle>
            <AlertDialogDescription>Planned content will be deleted from this day.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removingDay}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={removingDay} onClick={confirmLastDayRemoval}>
              {removingDay ? "Removing Day..." : "Remove Day"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
