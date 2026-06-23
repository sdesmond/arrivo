import type { TripEvent } from "@/data/types";

export interface ActiveTripSummarySelectionOptions {
  summaryEvents: TripEvent[];
  todayEvents: TripEvent[];
  now: Date;
  preferManualCurrent?: boolean;
}

export interface ActiveTripSummarySelection {
  currentEvent: TripEvent | null;
  nextEvent: TripEvent | null;
  undatedLinkedEvent: TripEvent | null;
  floatingNow: Date;
}

export function getFloatingNow(now: Date): Date {
  return new Date(
    Date.UTC(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds()
    )
  );
}

export function getActiveTripSummarySelection({
  summaryEvents,
  todayEvents,
  now,
  preferManualCurrent = false,
}: ActiveTripSummarySelectionOptions): ActiveTripSummarySelection {
  const floatingNow = getFloatingNow(now);
  const reversedEvents = [...summaryEvents].reverse();
  const currentEvent = preferManualCurrent
    ? (reversedEvents.find((event) => {
        if (!event.startAt) return false;
        return new Date(event.startAt) <= floatingNow && !event.linkedReservationId;
      }) ??
      reversedEvents.find((event) => {
        if (!event.startAt) return false;
        return new Date(event.startAt) <= floatingNow;
      }) ??
      null)
    : (reversedEvents.find((event) => {
        if (!event.startAt) return false;
        return new Date(event.startAt) <= floatingNow;
      }) ?? null);
  const nextEvent =
    summaryEvents.find((event) => {
      if (!event.startAt) return false;
      return new Date(event.startAt) > floatingNow;
    }) ?? null;
  const undatedLinkedEvent =
    !currentEvent && !nextEvent
      ? (todayEvents.find((event) => !event.startAt && event.linkedReservationId) ?? null)
      : null;

  return {
    currentEvent,
    nextEvent,
    undatedLinkedEvent,
    floatingNow,
  };
}
