import type { TripDateChangeConfirmation, TripDateChangePreviewEvent, UpdateTripPatch } from "@/data/types";

export interface ResolvedDateRange {
  startDate?: string;
  endDate?: string;
}

export interface TripDateSyncPlan {
  desiredDates: string[];
  addedDates: string[];
  removedDates: string[];
  retainedDates: string[];
}

export function resolveTripDateRange(
  existingRange: ResolvedDateRange,
  patch: Pick<UpdateTripPatch, "startDate" | "endDate">
): ResolvedDateRange {
  const requestedStart = patch.startDate !== undefined ? patch.startDate : (existingRange.startDate ?? patch.endDate);
  const requestedEnd = patch.endDate !== undefined ? patch.endDate : (existingRange.endDate ?? requestedStart);
  return {
    startDate: requestedStart ?? undefined,
    endDate: requestedEnd ?? requestedStart ?? undefined,
  };
}

export function buildTripDateSyncPlan(currentDates: string[], desiredDates: string[]): TripDateSyncPlan {
  const desiredDateSet = new Set(desiredDates);
  const currentDateSet = new Set(currentDates);

  return {
    desiredDates,
    addedDates: desiredDates.filter((date) => !currentDateSet.has(date)),
    removedDates: currentDates.filter((date) => !desiredDateSet.has(date)),
    retainedDates: desiredDates.filter((date) => currentDateSet.has(date)),
  };
}

export function buildTripDateChangeConfirmation(
  removedDates: string[],
  eventsToMove: TripDateChangePreviewEvent[],
  noteCount: number,
  checklistCount: number,
  eventDocumentCount: number
): TripDateChangeConfirmation {
  return {
    removedDates,
    events: eventsToMove,
    noteCount,
    checklistCount,
    eventDocumentCount,
  };
}
