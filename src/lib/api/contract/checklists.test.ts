import { expect, it } from "vitest";
import { createChecklist, updateChecklistTitle, deleteChecklist, updateChecklistItem } from "./checklists";
const uuid = "123e4567-e89b-12d3-a456-426614174000";
it("validates lifecycle envelopes, caps, UUIDs and positions", () => {
  expect(
    createChecklist.body.parse({
      dayId: uuid.toUpperCase(),
      id: uuid.toUpperCase(),
      position: 0,
      firstItem: { id: uuid.toUpperCase(), content: "Pack" },
    })
  ).toMatchObject({ dayId: uuid, id: uuid, firstItem: { id: uuid } });
  expect(createChecklist.body.parse({ dayId: uuid, position: 0, firstItem: { content: "Pack" } })).toEqual({
    dayId: uuid,
    position: 0,
    firstItem: { content: "Pack" },
  });
  for (const extra of [
    { position: -1 },
    { position: 0.5 },
    { position: 10001 },
    { id: "bad" },
    { title: "x".repeat(201) },
    { firstItem: { id: "bad", content: "Pack" } },
    { firstItem: { content: "x".repeat(301) } },
    { unknown: true },
  ]) {
    expect(createChecklist.body.safeParse({ dayId: uuid, position: 0, ...extra }).success).toBe(false);
  }
  expect(createChecklist.params.safeParse({ tripId: "bad" }).success).toBe(false);
  expect(updateChecklistTitle.body.parse({})).toEqual({});
  expect(updateChecklistTitle.body.parse({ title: null })).toEqual({ title: null });
  expect(updateChecklistTitle.body.safeParse({ content: "bad" }).success).toBe(false);
  expect(updateChecklistTitle.body.safeParse({ title: 1 }).success).toBe(false);
  expect(deleteChecklist.body.parse({ tripId: uuid })).toEqual({ tripId: uuid });
  expect(deleteChecklist.body.safeParse({ tripId: uuid, extra: true }).success).toBe(false);
});
it("accepts only an absolute checked state and UUID", () => {
  expect(updateChecklistItem.body.safeParse({ isChecked: true }).success).toBe(true);
  expect(updateChecklistItem.body.safeParse({ isChecked: false }).success).toBe(true);
  for (const body of [{}, { isChecked: "true" }, { isChecked: true, content: "extra" }])
    expect(updateChecklistItem.body.safeParse(body).success).toBe(false);
  expect(updateChecklistItem.params.safeParse({ itemId: "invalid" }).success).toBe(false);
});
