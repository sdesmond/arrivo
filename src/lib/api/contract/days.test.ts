import { expect, it } from "vitest";
import { reorderDay } from "./days";
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
