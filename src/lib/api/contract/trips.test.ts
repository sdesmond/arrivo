import { expect, it } from "vitest";
import { getTrip, updateTrip } from "./trips";

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
