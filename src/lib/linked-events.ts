import { ReservationType, type Reservation, type TripEvent } from "@/data/types";
import { ANCHOR_LABELS } from "@/components/arrivo/reservation-type-badge";
import { toLocalDateKey } from "@/lib/utils";

// Manual events/notes/checklists share one small-sequential-integer position space (see
// shiftItemsAtOrAbove in trips/[tripId]/actions.ts). Subtracting this offset from the anchor's
// epoch-ms timestamp guarantees every Linked Event sorts above any real item while still
// preserving correct chronological order among Linked Events on the same day.
const LINKED_EVENT_POSITION_OFFSET = -10_000_000_000_000;

function normalizeReservationType(type: Reservation["type"]): ReservationType {
  return typeof type === "string" && Object.hasOwn(ANCHOR_LABELS, type) ? type : ReservationType.Other;
}

export function deriveLinkedEvents(reservations: Reservation[]): TripEvent[] {
  const linkedEvents: TripEvent[] = [];

  for (const reservation of reservations) {
    const reservationType = normalizeReservationType(reservation.type);
    const anchorLabels = ANCHOR_LABELS[reservationType] ?? ANCHOR_LABELS.other;
    const providerSuffix = [reservation.provider, reservation.serviceNumber].filter(Boolean).join(" ");

    const isSameLocalDay =
      !!reservation.startAt &&
      !!reservation.endAt &&
      toLocalDateKey(reservation.startAt) === toLocalDateKey(reservation.endAt);

    if (isSameLocalDay) {
      linkedEvents.push({
        id: `linked-${reservation.id}`,
        tripId: reservation.tripId,
        name: providerSuffix,
        startAt: reservation.startAt,
        endAt: reservation.endAt,
        linkedReservationId: reservation.id,
        reservationType,
        position: new Date(reservation.startAt!).getTime() + LINKED_EVENT_POSITION_OFFSET,
      });
      continue;
    }

    if (reservation.startAt) {
      linkedEvents.push({
        id: `linked-${reservation.id}-start`,
        tripId: reservation.tripId,
        name: `${anchorLabels.start} — ${providerSuffix}`,
        startAt: reservation.startAt,
        linkedReservationId: reservation.id,
        reservationType,
        position: new Date(reservation.startAt).getTime() + LINKED_EVENT_POSITION_OFFSET,
      });
    }

    if (reservation.endAt) {
      linkedEvents.push({
        id: `linked-${reservation.id}-end`,
        tripId: reservation.tripId,
        name: `${anchorLabels.end} — ${providerSuffix}`,
        startAt: reservation.endAt,
        linkedReservationId: reservation.id,
        reservationType,
        position: new Date(reservation.endAt).getTime() + LINKED_EVENT_POSITION_OFFSET,
      });
    }
  }

  return linkedEvents;
}
