import { expect, it } from "vitest";
import { updateTrip } from "./trips";

const tripId = "123e4567-e89b-12d3-a456-426614174000";
it("validates strict partial metadata and normalizes currency", () => {
  expect(updateTrip.params.parse({ tripId: tripId.toUpperCase() })).toEqual({ tripId });
  expect(updateTrip.body.parse({ budgetTotal: 0, budgetCurrency: "usd", destinationName: null })).toMatchObject({
    budgetTotal: 0,
    budgetCurrency: "USD",
    destinationName: null,
  });
  expect(updateTrip.body.parse({})).toEqual({});
  for (const body of [
    { startDate: "2026-01-01" },
    { coverUrl: "x" },
    { extra: true },
    { budgetCurrency: "ZZZ" },
    { transitMode: "invalid" },
  ])
    expect(updateTrip.body.safeParse(body).success).toBe(false);
});
