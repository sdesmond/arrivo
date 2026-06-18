import { describe, expect, it } from "vitest";
import type { Reservation } from "@/data/types";
import * as linkedEventsModule from "./linked-events";

const { deriveLinkedEvents } = linkedEventsModule;

function createReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "reservation-1",
    tripId: "trip-1",
    type: "flight",
    provider: "TAP Air Portugal",
    startAt: "2030-06-16T15:00:00Z",
    documents: [],
    ...overrides,
  };
}

describe("deriveLinkedEvents", () => {
  it("exports exactly one function with the expected name", () => {
    expect(Object.keys(linkedEventsModule)).toEqual(["deriveLinkedEvents"]);
    expect(typeof deriveLinkedEvents).toBe("function");
  });

  it("returns empty array for empty reservations input", () => {
    expect(deriveLinkedEvents([])).toEqual([]);
  });

  it("produces one TripEvent for single-anchor Flight (no endTime)", () => {
    const reservation = createReservation();

    expect(deriveLinkedEvents([reservation])).toEqual([
      expect.objectContaining({
        id: "linked-reservation-1-start",
        tripId: "trip-1",
        name: "Departure — TAP Air Portugal",
        startAt: "2030-06-16T15:00:00Z",
        linkedReservationId: "reservation-1",
        reservationType: "flight",
      }),
    ]);
  });

  it("produces two TripEvents for dual-anchor Lodging", () => {
    const reservation = createReservation({
      id: "reservation-2",
      type: "lodging",
      provider: "Torel Avantgarde",
      endAt: "2030-06-18T11:00:00Z",
    });

    expect(deriveLinkedEvents([reservation])).toEqual([
      expect.objectContaining({
        id: "linked-reservation-2-start",
        name: "Check-in — Torel Avantgarde",
        linkedReservationId: "reservation-2",
        reservationType: "lodging",
      }),
      expect.objectContaining({
        id: "linked-reservation-2-end",
        name: "Check-out — Torel Avantgarde",
        linkedReservationId: "reservation-2",
        reservationType: "lodging",
      }),
    ]);
  });

  it("produces two TripEvents for Rental Car (Pickup/Return)", () => {
    const reservation = createReservation({
      id: "reservation-3",
      type: "rental-car",
      provider: "Avis",
      endAt: "2030-06-17T18:30:00Z",
    });

    expect(deriveLinkedEvents([reservation]).map((event) => event.name)).toEqual(["Pickup — Avis", "Return — Avis"]);
  });

  it("produces two TripEvents for Cruise (Departure/Return)", () => {
    const reservation = createReservation({
      id: "reservation-4",
      type: "cruise",
      provider: "Viking",
      endAt: "2030-06-20T08:30:00Z",
    });

    expect(deriveLinkedEvents([reservation]).map((event) => event.name)).toEqual([
      "Departure — Viking",
      "Return — Viking",
    ]);
  });

  it("produces one TripEvent for Train with no endTime", () => {
    const reservation = createReservation({
      id: "reservation-5",
      type: "train",
      provider: "Amtrak",
    });

    expect(deriveLinkedEvents([reservation]).map((event) => event.name)).toEqual(["Departure — Amtrak"]);
  });

  it("produces one TripEvent for Bus with no endTime", () => {
    const reservation = createReservation({
      id: "reservation-6",
      type: "bus",
      provider: "FlixBus",
    });

    expect(deriveLinkedEvents([reservation]).map((event) => event.name)).toEqual(["Departure — FlixBus"]);
  });

  it("produces one TripEvent for Ferry with no endTime", () => {
    const reservation = createReservation({
      id: "reservation-7",
      type: "ferry",
      provider: "Blue Star Ferries",
    });

    expect(deriveLinkedEvents([reservation]).map((event) => event.name)).toEqual(["Departure — Blue Star Ferries"]);
  });

  it("produces one TripEvent for Other with no endTime (Start label)", () => {
    const reservation = createReservation({
      id: "reservation-8",
      type: "other",
      provider: "Some Booking",
    });

    expect(deriveLinkedEvents([reservation])).toEqual([
      expect.objectContaining({
        name: "Start — Some Booking",
      }),
    ]);
  });

  it("produces two TripEvents for Other with endTime (Start/End labels)", () => {
    const reservation = createReservation({
      id: "reservation-9",
      type: "other",
      provider: "Some Booking",
      endAt: "2030-06-17T18:00:00Z",
    });

    expect(deriveLinkedEvents([reservation]).map((event) => event.name)).toEqual([
      "Start — Some Booking",
      "End — Some Booking",
    ]);
  });

  it("sets position far below any real item's position so Linked Events always sort first", () => {
    const reservation = createReservation({
      startAt: "2030-06-16T15:00:00Z",
    });

    expect(deriveLinkedEvents([reservation])[0]?.position).toBeLessThan(-1_000_000_000);
  });

  it("preserves chronological order between two Linked Events on the same day", () => {
    const earlier = createReservation({ id: "reservation-15", startAt: "2030-06-16T08:00:00Z" });
    const later = createReservation({ id: "reservation-16", startAt: "2030-06-16T20:00:00Z" });

    const [earlierEvent, laterEvent] = deriveLinkedEvents([earlier, later]);

    expect(earlierEvent?.position).toBeLessThan(laterEvent!.position);
  });

  it("handles missing startAt defensively (skips start anchor)", () => {
    const reservation = createReservation({
      id: "reservation-10",
      startAt: undefined,
      endAt: "2030-06-17T11:00:00Z",
      type: "lodging",
      provider: "Late Checkout Hotel",
    });

    expect(deriveLinkedEvents([reservation])).toEqual([
      expect.objectContaining({
        id: "linked-reservation-10-end",
        name: "Check-out — Late Checkout Hotel",
      }),
    ]);
  });

  it("handles empty provider string", () => {
    const reservation = createReservation({
      id: "reservation-11",
      provider: "",
    });

    expect(deriveLinkedEvents([reservation])[0]?.name).toBe("Departure — ");
  });

  it("produces correct events for mixed input array", () => {
    const reservations = [
      createReservation({
        id: "reservation-12",
        type: "flight",
        provider: "TAP Air Portugal",
      }),
      createReservation({
        id: "reservation-13",
        type: "lodging",
        provider: "Torel Avantgarde",
        endAt: "2030-06-18T11:00:00Z",
      }),
    ];

    expect(deriveLinkedEvents(reservations).map((event) => event.name)).toEqual([
      "Departure — TAP Air Portugal",
      "Check-in — Torel Avantgarde",
      "Check-out — Torel Avantgarde",
    ]);
  });

  it("combines start and end into a single TripEvent when they fall on the same local day", () => {
    const reservation = createReservation({
      id: "reservation-17",
      type: "flight",
      provider: "Delta",
      startAt: "2030-06-16T18:00:00Z",
      endAt: "2030-06-17T02:00:00Z",
    });

    expect(deriveLinkedEvents([reservation])).toEqual([
      expect.objectContaining({
        id: "linked-reservation-17",
        name: "Delta",
        startAt: "2030-06-16T18:00:00Z",
        endAt: "2030-06-17T02:00:00Z",
        linkedReservationId: "reservation-17",
        reservationType: "flight",
      }),
    ]);
  });

  it("keeps two separate TripEvents when start and end fall on different local days", () => {
    const reservation = createReservation({
      id: "reservation-18",
      type: "flight",
      provider: "Delta",
      startAt: "2030-06-16T08:00:00Z",
      endAt: "2030-06-17T20:00:00Z",
    });

    expect(deriveLinkedEvents([reservation]).map((event) => event.name)).toEqual([
      "Departure — Delta",
      "Arrival — Delta",
    ]);
  });

  it("uses the local calendar day, not the UTC day, to decide whether to combine", () => {
    const originalTz = process.env.TZ;
    process.env.TZ = "America/Denver";
    try {
      // 5:00 PM Apr 24 Denver (UTC-6) -> 2030-04-24T23:00:00Z
      // 10:00 PM Apr 24 Denver (UTC-6) -> 2030-04-25T04:00:00Z
      // Same local day (Apr 24) despite different UTC calendar days.
      const reservation = createReservation({
        id: "reservation-19",
        type: "flight",
        provider: "Delta",
        startAt: "2030-04-24T23:00:00.000Z",
        endAt: "2030-04-25T04:00:00.000Z",
      });

      expect(deriveLinkedEvents([reservation])).toHaveLength(1);
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it("falls back to Other labels when a legacy reservation type slips through at runtime", () => {
    const reservation = createReservation({
      id: "reservation-14",
      type: "hotel" as Reservation["type"],
      provider: "Legacy Booking",
      endAt: "2030-06-17T18:00:00Z",
    });

    expect(deriveLinkedEvents([reservation])).toEqual([
      expect.objectContaining({
        name: "Start — Legacy Booking",
        reservationType: "other",
      }),
      expect.objectContaining({
        name: "End — Legacy Booking",
        reservationType: "other",
      }),
    ]);
  });
});
