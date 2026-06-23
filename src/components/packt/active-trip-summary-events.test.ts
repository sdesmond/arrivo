import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TripEvent } from "@/data/types";
import { getActiveTripSummarySelection } from "./active-trip-summary-events";

const NOW = new Date("2026-05-13T12:00:00.000Z");

describe("getActiveTripSummarySelection", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "UTC";
  });

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("prefers a manual current event over a linked one when requested", () => {
    const summaryEvents: TripEvent[] = [
      {
        id: "linked-current",
        name: "Check-in — Hotel Avenida Palace",
        startAt: "2026-05-13T11:30:00Z",
        position: 0,
        linkedReservationId: "res-1",
        reservationType: "lodging",
      },
      {
        id: "manual-current",
        name: "Museum Visit",
        startAt: "2026-05-13T10:00:00Z",
        position: 1,
      },
      {
        id: "future-event",
        name: "Dinner",
        startAt: "2026-05-13T18:00:00Z",
        position: 2,
      },
    ];

    const selection = getActiveTripSummarySelection({
      summaryEvents,
      todayEvents: [],
      now: NOW,
      preferManualCurrent: true,
    });

    expect(selection.currentEvent?.id).toBe("manual-current");
    expect(selection.nextEvent?.id).toBe("future-event");
  });

  it("returns undated linked fallback only when no timed summary rows exist", () => {
    const selection = getActiveTripSummarySelection({
      summaryEvents: [],
      todayEvents: [
        { id: "linked-fallback", name: "Check-in — Hotel Avenida Palace", position: 0, linkedReservationId: "res-1" },
      ],
      now: NOW,
    });

    expect(selection.currentEvent).toBeNull();
    expect(selection.nextEvent).toBeNull();
    expect(selection.undatedLinkedEvent?.id).toBe("linked-fallback");
  });
});
