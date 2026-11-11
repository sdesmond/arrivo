import { describe, expect, it } from "vitest";
import { FIELD_LIMITS } from "@/lib/validation-limits";
import { addDay, deleteDay, reorderDay, updateDay } from "./days";
const dayId = "123e4567-e89b-12d3-a456-426614174000";
const otherId = "223e4567-e89b-12d3-a456-426614174000";
it("describes the keyed PUT for a day's order", () => {
  expect(reorderDay.method).toBe("PUT");
  expect(reorderDay.path).toBe("/api/v1/days/:dayId/order");
  expect(reorderDay.params.parse({ dayId: dayId.toUpperCase() })).toEqual({ dayId });
  expect(reorderDay.params.safeParse({ dayId: "bad" }).success).toBe(false);
});
it("accepts mixed types, lowercases ids and allows an empty day", () => {
  expect(
    reorderDay.body.parse({
      items: [
        { type: "event", id: dayId.toUpperCase() },
        { type: "note", id: otherId },
        { type: "checklist", id: dayId },
      ],
    })
  ).toEqual({
    items: [
      { type: "event", id: dayId },
      { type: "note", id: otherId },
      { type: "checklist", id: dayId },
    ],
  });
  expect(reorderDay.body.parse({ items: [] })).toEqual({ items: [] });
});
it("allows one id under different types but rejects a repeated type and id", () => {
  expect(
    reorderDay.body.safeParse({
      items: [
        { type: "event", id: dayId },
        { type: "note", id: dayId },
      ],
    }).success
  ).toBe(true);
  const duplicate = reorderDay.body.safeParse({
    items: [
      { type: "event", id: dayId },
      { type: "event", id: dayId.toUpperCase() },
    ],
  });
  expect(duplicate.success).toBe(false);
});
it("rejects unknown types, bad ids, extra fields, a missing list and more than 500 items", () => {
  for (const body of [
    {},
    { items: [{ type: "reservation", id: dayId }] },
    { items: [{ type: "event", id: "bad" }] },
    { items: [{ type: "event", id: dayId, position: 0 }] },
    { items: [], extra: true },
  ]) {
    expect(reorderDay.body.safeParse(body).success).toBe(false);
  }
  const item = (index: number) => ({
    type: "event",
    id: `${index.toString(16).padStart(8, "0")}-e89b-12d3-a456-426614174000`,
  });
  expect(reorderDay.body.safeParse({ items: Array.from({ length: 500 }, (_, index) => item(index)) }).success).toBe(
    true
  );
  expect(reorderDay.body.safeParse({ items: Array.from({ length: 501 }, (_, index) => item(index)) }).success).toBe(
    false
  );
});

describe("updateDay", () => {
  it("describes the keyed partial PATCH for a day", () => {
    expect(updateDay.method).toBe("PATCH");
    expect(updateDay.path).toBe("/api/v1/days/:dayId");
    expect(updateDay.params.parse({ dayId: dayId.toUpperCase() })).toEqual({ dayId });
    expect(updateDay.params.safeParse({ dayId: "bad" }).success).toBe(false);
  });

  it("accepts any subset, null to clear text fields, and an empty patch", () => {
    expect(updateDay.body.parse({})).toEqual({});
    expect(updateDay.body.parse({ label: "Arrival" })).toEqual({ label: "Arrival" });
    expect(updateDay.body.parse({ subtitle: null, weather: null, travelSummary: null })).toEqual({
      subtitle: null,
      weather: null,
      travelSummary: null,
    });
    expect(updateDay.body.parse({ subtitle: "Rome", weather: "Sunny", travelSummary: "Train" })).toEqual({
      subtitle: "Rome",
      weather: "Sunny",
      travelSummary: "Train",
    });
  });

  it("rejects a null label, over-cap text, wrong types and unknown keys", () => {
    for (const body of [
      { label: null },
      { label: "x".repeat(FIELD_LIMITS.dayLabel + 1) },
      { subtitle: "x".repeat(FIELD_LIMITS.dayText + 1) },
      { weather: "x".repeat(FIELD_LIMITS.dayText + 1) },
      { travelSummary: "x".repeat(FIELD_LIMITS.dayText + 1) },
      { label: 3 },
      { dayNumber: 2 },
      { id: dayId },
    ]) {
      expect(updateDay.body.safeParse(body).success).toBe(false);
    }
    expect(updateDay.body.safeParse({ label: "x".repeat(FIELD_LIMITS.dayLabel) }).success).toBe(true);
  });
});

describe("addDay", () => {
  it("describes the keyed POST that appends a day", () => {
    expect(addDay.method).toBe("POST");
    expect(addDay.path).toBe("/api/v1/trips/:tripId/days");
    expect(addDay.params.parse({ tripId: otherId.toUpperCase() })).toEqual({ tripId: otherId });
    expect(addDay.params.safeParse({ tripId: "bad" }).success).toBe(false);
  });

  it("takes an optional lowercased client id and nothing else", () => {
    expect(addDay.body.parse({})).toEqual({});
    expect(addDay.body.parse({ id: dayId.toUpperCase() })).toEqual({ id: dayId });
    expect(addDay.body.safeParse({ id: "bad" }).success).toBe(false);
    expect(addDay.body.safeParse({ label: "Day 9" }).success).toBe(false);
  });
});

describe("deleteDay", () => {
  it("describes the keyed DELETE with no response body", () => {
    expect(deleteDay.method).toBe("DELETE");
    expect(deleteDay.path).toBe("/api/v1/days/:dayId");
    expect(deleteDay.status).toBe(204);
    expect(deleteDay.params.parse({ dayId: dayId.toUpperCase() })).toEqual({ dayId });
  });

  it("requires the trip and takes an optional confirmation", () => {
    expect(deleteDay.body.parse({ tripId: otherId.toUpperCase() })).toEqual({ tripId: otherId });
    expect(deleteDay.body.parse({ tripId: otherId, confirmDestructive: true })).toEqual({
      tripId: otherId,
      confirmDestructive: true,
    });
    for (const body of [
      {},
      { tripId: "bad" },
      { tripId: otherId, confirmDestructive: "yes" },
      { tripId: otherId, x: 1 },
    ]) {
      expect(deleteDay.body.safeParse(body).success).toBe(false);
    }
  });
});
