"use client";

import { useState } from "react";
import type { ReactElement } from "react";
import { CalendarDays, FileText, ListChecks, MapPin, Plus } from "lucide-react";
import { DayCard } from "@/components/packt/day-card";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
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
import type { DayItinerary, TripEvent, DayItemType, Document } from "@/data/types";
import { UnscheduledEventsSection } from "./unscheduled-events-section";

export interface TripItineraryViewProps {
  days: DayItinerary[];
  unscheduledEvents: TripEvent[];
  dateFormat?: string;
  initialExpandedDayNumber?: number;
  isNew?: boolean;
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
  onAddDay: () => void;
  onRemoveLastDay: (
    confirmedDestructiveRemoval: boolean,
    onConfirmationRequired: (hasPlannedContent: boolean, removesOnlyDay: boolean) => void
  ) => void;
  addingDay: boolean;
  removingDay: boolean;
}

interface RemovalConfirmation {
  hasPlannedContent: boolean;
  removesOnlyDay: boolean;
}

export function TripItineraryView({
  days,
  unscheduledEvents,
  dateFormat,
  initialExpandedDayNumber,
  isNew,
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
  onAddDay,
  onRemoveLastDay,
  addingDay,
  removingDay,
}: TripItineraryViewProps): ReactElement {
  const [removalConfirmation, setRemovalConfirmation] = useState<RemovalConfirmation | null>(null);
  const [initialRenderDayCount] = useState(() => days.length);

  if (days.length === 0 && unscheduledEvents.length === 0) {
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

  const lastDay = days.at(-1);
  const lastDayHasPlannedContent =
    lastDay !== undefined &&
    (lastDay.events.length > 0 || (lastDay.notes?.length ?? 0) > 0 || (lastDay.checklists?.length ?? 0) > 0);

  function requireRemovalConfirmation(hasPlannedContent: boolean, removesOnlyDay: boolean): void {
    setRemovalConfirmation({ hasPlannedContent, removesOnlyDay });
  }

  function requestLastDayRemoval(): void {
    if (!lastDay) return;
    if (days.length === 1 || lastDayHasPlannedContent) {
      requireRemovalConfirmation(lastDayHasPlannedContent, days.length === 1);
      return;
    }
    onRemoveLastDay(false, requireRemovalConfirmation);
  }

  function confirmLastDayRemoval(): void {
    onRemoveLastDay(true, requireRemovalConfirmation);
    setRemovalConfirmation(null);
  }

  return (
    <>
      <div>
        <UnscheduledEventsSection
          unscheduledEvents={unscheduledEvents}
          dateFormat={dateFormat}
          tripDocs={tripDocs}
          onUpdateEvent={onUpdateEvent}
          onDeleteEvent={onDeleteEvent}
        />
        {days.map((day, index) => {
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
              onRemove={day.dayNumber === lastDay?.dayNumber ? requestLastDayRemoval : undefined}
              removeDisabled={removingDay || addingDay}
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
      <AlertDialog
        open={removalConfirmation !== null}
        onOpenChange={(open) => {
          if (!open) setRemovalConfirmation(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Day</AlertDialogTitle>
            <AlertDialogDescription>
              {removalConfirmation?.hasPlannedContent
                ? `Planned content will be deleted from this day.${
                    removalConfirmation.removesOnlyDay ? " Removing it also marks this trip as unscheduled." : ""
                  }`
                : "Removing the only day marks this trip as unscheduled and clears its dates."}
            </AlertDialogDescription>
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
