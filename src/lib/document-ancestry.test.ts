// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventRows: [] as { tripId: string }[],
  reservationRows: [] as { tripId: string }[],
  selected: [] as unknown[],
}));
const tables = vi.hoisted(() => ({
  events: { id: "events.id", tripId: "events.tripId" },
  reservations: { id: "reservations.id", tripId: "reservations.tripId" },
}));
vi.mock("@/db/schema", () => tables);

import { readEventTripId, readReservationTripId, resolveDocumentTripId } from "./document-ancestry";

const executor = {
  select: () => ({
    from: (table: unknown) => ({
      where: async () => {
        mocks.selected.push(table);
        return table === tables.events ? mocks.eventRows : mocks.reservationRows;
      },
    }),
  }),
} as unknown as Parameters<typeof resolveDocumentTripId>[0];
const row = (overrides: Record<string, unknown> = {}) =>
  ({ tripId: null, eventId: null, reservationId: null, ...overrides }) as Parameters<typeof resolveDocumentTripId>[1];

beforeEach(() => {
  mocks.eventRows = [{ tripId: "trip-a" }];
  mocks.reservationRows = [{ tripId: "trip-a" }];
  mocks.selected = [];
});

describe("resolveDocumentTripId", () => {
  it("returns an explicit trip without reading any parent", async () => {
    await expect(resolveDocumentTripId(executor, row({ tripId: "trip-a" }))).resolves.toBe("trip-a");
    expect(mocks.selected).toEqual([]);
  });

  it.each([
    ["event", { eventId: "event-1" }],
    ["reservation", { reservationId: "reservation-1" }],
    ["both", { eventId: "event-1", reservationId: "reservation-1" }],
    ["explicit trip and event", { tripId: "trip-a", eventId: "event-1" }],
    ["explicit trip and reservation", { tripId: "trip-a", reservationId: "reservation-1" }],
    ["explicit trip and both parents", { tripId: "trip-a", eventId: "event-1", reservationId: "reservation-1" }],
  ])("returns the agreed trip for a consistent %s link", async (_label, links) => {
    await expect(resolveDocumentTripId(executor, row(links))).resolves.toBe("trip-a");
  });

  it.each([
    [
      "event and reservation in different trips",
      { eventId: "event-1", reservationId: "reservation-1" },
      "trip-a",
      "trip-b",
    ],
    ["an explicit trip and a foreign event", { tripId: "trip-b", eventId: "event-1" }, "trip-a", "trip-a"],
    [
      "an explicit trip and a foreign reservation",
      { tripId: "trip-b", reservationId: "reservation-1" },
      "trip-a",
      "trip-a",
    ],
    [
      "a trip that matches only the reservation",
      { tripId: "trip-b", eventId: "event-1", reservationId: "reservation-1" },
      "trip-a",
      "trip-b",
    ],
  ])("is unresolved for %s", async (_label, links, eventTrip, reservationTrip) => {
    mocks.eventRows = [{ tripId: eventTrip }];
    mocks.reservationRows = [{ tripId: reservationTrip }];
    await expect(resolveDocumentTripId(executor, row(links))).resolves.toBeUndefined();
  });

  it.each([
    ["a missing event", { eventId: "event-1" }],
    ["a missing reservation", { reservationId: "reservation-1" }],
    ["a missing event beside a trip", { tripId: "trip-a", eventId: "event-1" }],
    ["a missing reservation beside a trip", { tripId: "trip-a", reservationId: "reservation-1" }],
  ])("is unresolved for %s", async (_label, links) => {
    mocks.eventRows = [];
    mocks.reservationRows = [];
    await expect(resolveDocumentTripId(executor, row(links))).resolves.toBeUndefined();
  });

  it("is unresolved for an orphan with no trip, event or reservation", async () => {
    await expect(resolveDocumentTripId(executor, row())).resolves.toBeUndefined();
    expect(mocks.selected).toEqual([]);
  });
});

describe("parent trip readers", () => {
  it("reads the trip of an event and of a reservation", async () => {
    mocks.eventRows = [{ tripId: "trip-e" }];
    mocks.reservationRows = [{ tripId: "trip-r" }];
    await expect(readEventTripId(executor, "event-1")).resolves.toBe("trip-e");
    await expect(readReservationTripId(executor, "reservation-1")).resolves.toBe("trip-r");
  });

  it("returns undefined for a parent that is gone", async () => {
    mocks.eventRows = [];
    mocks.reservationRows = [];
    await expect(readEventTripId(executor, "event-1")).resolves.toBeUndefined();
    await expect(readReservationTripId(executor, "reservation-1")).resolves.toBeUndefined();
  });
});
