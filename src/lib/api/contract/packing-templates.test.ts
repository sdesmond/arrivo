import { expect, it } from "vitest";
import { createPackingTemplate, listPackingTemplates, savePackingListAsTemplate } from "./packing-templates";
import { FIELD_LIMITS } from "@/lib/validation-limits";
const uuid = "123e4567-e89b-12d3-a456-426614174000";
it("accepts only an empty list body", () => {
  expect(listPackingTemplates.method).toBe("GET");
  expect(listPackingTemplates.body.safeParse({}).success).toBe(true);
  expect(listPackingTemplates.body.safeParse({ extra: 1 }).success).toBe(false);
});
it("normalizes the id and trims the name", () => {
  expect(createPackingTemplate.method).toBe("POST");
  expect(createPackingTemplate.body.parse({ id: uuid.toUpperCase(), name: "  Beach  " })).toEqual({
    id: uuid,
    name: "Beach",
  });
});
it("rejects blank, over-limit, extra and missing fields", () => {
  for (const body of [
    { id: uuid, name: "   " },
    { id: uuid, name: "x".repeat(FIELD_LIMITS.templateName + 1) },
    { id: uuid, name: "Ok", extra: true },
    { id: "bad", name: "Ok" },
    { name: "Ok" },
  ])
    expect(createPackingTemplate.body.safeParse(body).success).toBe(false);
  expect(createPackingTemplate.body.safeParse({ id: uuid, name: "x".repeat(FIELD_LIMITS.templateName) }).success).toBe(
    true
  );
});
it("accepts only the trip, template id and a trimmed name for a list save", () => {
  const listId = "123e4567-e89b-12d3-a456-426614174001";
  const tripId = "123e4567-e89b-12d3-a456-426614174002";
  expect(savePackingListAsTemplate.method).toBe("POST");
  expect(savePackingListAsTemplate.path).toBe("/api/v1/packing-lists/:listId/template");
  expect(savePackingListAsTemplate.params.parse({ listId })).toEqual({ listId });
  expect(savePackingListAsTemplate.params.safeParse({ listId: "bad" }).success).toBe(false);
  expect(savePackingListAsTemplate.body.parse({ tripId, id: uuid.toUpperCase(), name: "  Beach " })).toEqual({
    tripId,
    id: uuid,
    name: "Beach",
  });
  for (const body of [
    { tripId, id: uuid, name: "  " },
    { tripId, id: uuid, name: "x".repeat(FIELD_LIMITS.templateName + 1) },
    { tripId, id: uuid, name: "Ok", extra: true },
    { id: uuid, name: "Ok" },
    { tripId, name: "Ok" },
  ])
    expect(savePackingListAsTemplate.body.safeParse(body).success).toBe(false);
});
