"use client";

import { useState } from "react";
import type { ReactElement } from "react";
import { CalendarDays, ChevronDown, ChevronRight, FileText, ListChecks, MapPin, Plus } from "lucide-react";
import { DayCard } from "@/components/packt/day-card";
import { PlaceRow } from "@/components/packt/place-row";
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
import { formatDate } from "@/lib/utils";

export interface TripItineraryViewProps {
  days: DayItinerary[];
  unscheduledEvents: TripEvent[];
  dateFormat?: string;
  initialExpandedDayNumber?: number;
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
  const [unscheduledOpen, setUnscheduledOpen] = useState(true);

  const groupedUnscheduledEvents = unscheduledEvents.reduce<Record<string, TripEvent[]>>((groups, event) => {
    const groupKey = event.displacedDate ?? "no-date";
    groups[groupKey] = [...(groups[groupKey] ?? []), event];
    groups[groupKey].sort((first, second) => first.position - second.position);
    return groups;
  }, {});

  const groupedUnscheduledEntries: Array<[string, TripEvent[]]> = Object.entries(groupedUnscheduledEvents).sort(
    ([firstDate], [secondDate]) => {
      if (firstDate === "no-date") return 1;
      if (secondDate === "no-date") return -1;
      return firstDate.localeCompare(secondDate);
    }
  );

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
        {unscheduledEvents.length > 0 && (
          <div
            className="mb-4 overflow-hidden"
            style={{
              borderRadius: 14,
              border: "1px solid var(--line)",
              background: "var(--surface)",
            }}
          >
            <button
              className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left"
              onClick={() => setUnscheduledOpen((value) => !value)}
              title={unscheduledOpen ? "Collapse unscheduled events" : "Expand unscheduled events"}
              style={{ background: "none", border: "none" }}
            >
              <div>
                <div style={{ fontSize: "calc(15px * var(--font-scale))", fontWeight: 600, color: "var(--fg)" }}>
                  Unscheduled Events
                </div>
                <div style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--fg-3)" }}>
                  Preserved from removed trip dates
                </div>
              </div>
              <div className="flex items-center gap-3" style={{ color: "var(--fg-3)" }}>
                <span style={{ fontSize: "calc(12px * var(--font-scale))" }}>
                  {unscheduledEvents.length} event{unscheduledEvents.length === 1 ? "" : "s"}
                </span>
                {unscheduledOpen ? (
                  <ChevronDown size={16} strokeWidth={1.5} />
                ) : (
                  <ChevronRight size={16} strokeWidth={1.5} />
                )}
              </div>
            </button>

            {unscheduledOpen && (
              <div className="px-3 pb-3" style={{ borderTop: "1px solid var(--line)" }}>
                {groupedUnscheduledEntries.map(([dateKey, eventsForDate]) => (
                  <div key={dateKey} className="pt-3">
                    <div
                      className="px-3 pb-2"
                      style={{
                        fontSize: "calc(11px * var(--font-scale))",
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "var(--fg-3)",
                      }}
                    >
                      {dateKey === "no-date"
                        ? "Original date unavailable"
                        : formatDate(dateKey, dateFormat ?? "MM/DD/YYYY")}
                    </div>
                    {eventsForDate.map((event, index) => (
                      <PlaceRow
                        key={event.id}
                        id={`unscheduled-event-${event.id}`}
                        place={event}
                        dayDate={event.startAt?.slice(0, 10) ?? event.displacedDate}
                        isLast={index === eventsForDate.length - 1}
                        onUpdate={onUpdateEvent}
                        onDelete={onDeleteEvent}
                        tripDocs={tripDocs}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {days.map((day) => (
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
        ))}
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
