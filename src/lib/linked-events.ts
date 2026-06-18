import { ReservationType, type Reservation, type TripEvent } from "@/data/types";
import { ANCHOR_LABELS } from "@/components/packt/reservation-type-badge";

function normalizeReservationType(type: Reservation["type"]): ReservationType {
  return typeof type === "string" && Object.hasOwn(ANCHOR_LABELS, type) ? type : ReservationType.Other;
}

export function deriveLinkedEvents(reservations: Reservation[]): TripEvent[] {
  const linkedEvents: TripEvent[] = [];

  for (const reservation of reservations) {
    const reservationType = normalizeReservationType(reservation.type);
    const anchorLabels = ANCHOR_LABELS[reservationType] ?? ANCHOR_LABELS.other;
    const providerSuffix = reservation.provider ?? "";

    if (reservation.startAt) {
      linkedEvents.push({
        id: `linked-${reservation.id}-start`,
        tripId: reservation.tripId,
        name: `${anchorLabels.start} — ${providerSuffix}`,
        startAt: reservation.startAt,
        linkedReservationId: reservation.id,
        reservationType,
        position: new Date(reservation.startAt).getTime(),
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
        position: new Date(reservation.endAt).getTime(),
      });
    }
  }

  return linkedEvents;
}
