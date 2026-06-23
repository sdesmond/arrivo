"use client";

import { useRouter } from "next/navigation";
import { NowCard } from "@/components/packt/now-card";
import { buildReservationsDeepLinkHref } from "@/app/(app)/trips/[tripId]/trip-detail-tabs";
import { type Trip, type TripListEntry } from "@/data/types";

export interface TripsActiveEntryPanelProps {
  activeEntry: TripListEntry;
  dateFormat: string;
  onEditTrip: (tripId: string) => void;
  onDeleteTrip: (trip: Trip) => void;
}

export function TripsActiveEntryPanel({
  activeEntry,
  dateFormat,
  onEditTrip,
  onDeleteTrip,
}: TripsActiveEntryPanelProps) {
  const router = useRouter();

  function handleLinkedEventTap(linkedReservationId: string): void {
    router.push(
      buildReservationsDeepLinkHref(`/trips/${activeEntry.trip.id}`, new URLSearchParams(), {
        kind: "highlight",
        reservationId: linkedReservationId,
      })
    );
  }

  return (
    <NowCard
      trip={activeEntry.trip}
      todayEvents={activeEntry.todayEvents}
      summaryEvents={activeEntry.summaryEvents}
      onEditTrip={(trip) => onEditTrip(trip.id)}
      onDeleteTrip={onDeleteTrip}
      onLinkedEventTap={handleLinkedEventTap}
      dateFormat={dateFormat}
    />
  );
}
