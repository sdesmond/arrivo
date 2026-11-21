import { expect, it } from "vitest";
import { createTrip, deleteTrip, getTrip, listTrips, updateTrip } from "./trips";

const tripId = "123e4567-e89b-12d3-a456-426614174000";
it("validates strict partial metadata and normalizes currency", () => {
  expect(updateTrip.params.parse({ tripId: tripId.toUpperCase() })).toEqual({ tripId });
  expect(updateTrip.body.parse({ budgetTotal: 0, budgetCurrency: "usd", destinationName: null })).toMatchObject({
    budgetTotal: 0,
    budgetCurrency: "USD",
    destinationName: null,
  });
  expect(updateTrip.body.parse({})).toEqual({});
  expect(updateTrip.body.parse({ startDate: "2026-01-01", endDate: null, resolution: "delete-events" })).toMatchObject({
    startDate: "2026-01-01",
    endDate: null,
    resolution: "delete-events",
  });
  const confirmation = {
    removedDates: ["2026-01-02"],
    events: [{ id: "event", name: "Dinner", displacedDate: "2026-01-02", docCount: 1 }],
    reservations: [{ id: "res", provider: "Delta", type: "flight", date: "2026-01-02" }],
    noteCount: 0,
    checklistCount: 0,
    eventDocumentCount: 1,
  };
  expect(updateTrip.body.parse({ resolution: "keep-as-unscheduled", confirmation }).confirmation).toEqual(confirmation);
  // The server compares the echoed confirmation with a fresh one, so a key the contract stripped would make every
  // echo stale: a dateless trip's overflow labels and the removed reservations' file count must survive the parse.
  const datelessOverflow = {
    removedDates: [],
    removedDayLabels: ["Day 2"],
    events: [{ id: "event", name: "Dinner", docCount: 0 }],
    noteCount: 0,
    checklistCount: 0,
    eventDocumentCount: 0,
    reservationDocumentCount: 2,
  };
  expect(updateTrip.body.parse({ resolution: "delete-events", confirmation: datelessOverflow }).confirmation).toEqual(
    datelessOverflow
  );
  expect(
    updateTrip.body.safeParse({ confirmation: { ...datelessOverflow, reservationDocumentCount: -1 } }).success
  ).toBe(false);
  for (const body of [
    { startDate: "2026-13-01" },
    { resolution: "other" },
    { confirmation: { ...confirmation, noteCount: -1 } },
    { coverImageUrl: "https://example.com/x.jpg" },
    { coverUrl: "x" },
    { extra: true },
    { budgetCurrency: "ZZZ" },
    { transitMode: "invalid" },
  ])
    expect(updateTrip.body.safeParse(body).success).toBe(false);
});

it("defines the trip snapshot as a bodiless GET", () => {
  expect(getTrip.method).toBe("GET");
  expect(getTrip.path).toBe("/api/v1/trips/:tripId");
  expect(getTrip.params.parse({ tripId: "123E4567-E89B-12D3-A456-426614174000" }).tripId).toBe(
    "123e4567-e89b-12d3-a456-426614174000"
  );
  expect(getTrip.params.safeParse({ tripId: "nope" }).success).toBe(false);
  expect(getTrip.body.safeParse({}).success).toBe(true);
  expect(getTrip.body.safeParse({ extra: "x" }).success).toBe(false);
});

it("defines trip creation with a client UUID and the web form fields", () => {
  expect(createTrip.method).toBe("POST");
  expect(createTrip.path).toBe("/api/v1/trips");
  const parsed = createTrip.body.parse({
    id: tripId.toUpperCase(),
    name: "Paris",
    startDate: "2026-08-01",
    destinationCenter: [2.35, 48.85],
    budgetCurrency: " eur ",
    transitMode: null,
  });
  expect(parsed).toMatchObject({ id: tripId, name: "Paris", budgetCurrency: "EUR", transitMode: null });
  expect(parsed.destinationCenter).toEqual([2.35, 48.85]);
  for (const body of [
    { name: "No id" },
    { id: "nope", name: "Bad id" },
    { id: tripId },
    { id: tripId, name: "Cover", coverImageUrl: "https://example.com/x.jpg" },
    { id: tripId, name: "Extra", extra: true },
    { id: tripId, name: "Currency", budgetCurrency: "ZZZ" },
    { id: tripId, name: "Transit", transitMode: "teleport" },
    { id: tripId, name: "Date", startDate: "2026-13-01" },
  ])
    expect(createTrip.body.safeParse(body).success).toBe(false);
});

it("defines the trip list as a bodiless GET on the collection", () => {
  expect(listTrips.method).toBe("GET");
  expect(listTrips.path).toBe("/api/v1/trips");
  expect(listTrips.params.parse({})).toEqual({});
  expect(listTrips.body.safeParse({}).success).toBe(true);
  expect(listTrips.body.safeParse({ status: "past" }).success).toBe(false);
});

it("defines a strict bodiless trip deletion with a normalized UUID", () => {
  expect(deleteTrip.method).toBe("DELETE");
  expect(deleteTrip.path).toBe("/api/v1/trips/:tripId");
  expect(deleteTrip.params.parse({ tripId: tripId.toUpperCase() })).toEqual({ tripId });
  expect(deleteTrip.params.safeParse({ tripId: "bad" }).success).toBe(false);
  expect(deleteTrip.body.parse({})).toEqual({});
  expect(deleteTrip.body.safeParse({ force: true }).success).toBe(false);
});
