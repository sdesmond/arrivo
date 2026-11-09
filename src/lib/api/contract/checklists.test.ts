import { expect, it } from "vitest";
import {
  createChecklist,
  updateChecklistTitle,
  deleteChecklist,
  updateChecklistItem,
  createChecklistItem,
  deleteChecklistItem,
} from "./checklists";
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
it("accepts a partial item patch with absolute checked state, trimmed content and a UUID", () => {
  expect(updateChecklistItem.body.parse({ isChecked: true })).toEqual({ isChecked: true });
  expect(updateChecklistItem.body.parse({ isChecked: false })).toEqual({ isChecked: false });
  expect(updateChecklistItem.body.parse({ content: "  Passport  " })).toEqual({ content: "Passport" });
  expect(updateChecklistItem.body.parse({ content: "Passport", isChecked: false })).toEqual({
    content: "Passport",
    isChecked: false,
  });
  expect(updateChecklistItem.body.parse({})).toEqual({});
  expect(updateChecklistItem.params.parse({ itemId: uuid.toUpperCase() })).toEqual({ itemId: uuid });
  for (const body of [
    { isChecked: "true" },
    { isChecked: null },
    { content: 1 },
    { content: "   " },
    { content: "" },
    { content: "x".repeat(301) },
    { isChecked: true, extra: "extra" },
  ])
    expect(updateChecklistItem.body.safeParse(body).success).toBe(false);
  expect(updateChecklistItem.params.safeParse({ itemId: "invalid" }).success).toBe(false);
  expect(updateChecklistItem.method).toBe("PATCH");
});
it("caps item content after trimming it", () => {
  expect(updateChecklistItem.body.safeParse({ content: ` ${"x".repeat(300)} ` }).success).toBe(true);
});
it("defines item creation with an optional normalized UUID and required content", () => {
  expect(createChecklistItem.method).toBe("POST");
  expect(createChecklistItem.path).toBe("/api/v1/checklists/:checklistId/items");
  expect(createChecklistItem.status).toBeUndefined();
  expect(createChecklistItem.params.parse({ checklistId: uuid.toUpperCase() })).toEqual({ checklistId: uuid });
  expect(createChecklistItem.params.safeParse({ checklistId: "bad" }).success).toBe(false);
  expect(createChecklistItem.body.parse({ content: " Pack " })).toEqual({ content: "Pack" });
  expect(createChecklistItem.body.parse({ id: uuid.toUpperCase(), content: "Pack" })).toEqual({
    id: uuid,
    content: "Pack",
  });
  for (const body of [
    {},
    { id: "bad", content: "Pack" },
    { content: "" },
    { content: "  " },
    { content: "x".repeat(301) },
    { content: "Pack", isChecked: true },
  ])
    expect(createChecklistItem.body.safeParse(body).success).toBe(false);
});
it("defines item deletion with trip context and a 204 response", () => {
  expect(deleteChecklistItem.method).toBe("DELETE");
  expect(deleteChecklistItem.path).toBe("/api/v1/checklist-items/:itemId");
  expect(deleteChecklistItem.status).toBe(204);
  expect(deleteChecklistItem.params.parse({ itemId: uuid.toUpperCase() })).toEqual({ itemId: uuid });
  expect(deleteChecklistItem.body.parse({ tripId: uuid.toUpperCase() })).toEqual({ tripId: uuid });
  for (const body of [{}, { tripId: "bad" }, { tripId: uuid, extra: true }])
    expect(deleteChecklistItem.body.safeParse(body).success).toBe(false);
});
