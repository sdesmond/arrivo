import { expect, it } from "vitest";
import {
  createPackingTemplate,
  listPackingTemplates,
  savePackingListAsTemplate,
  reorderPackingTemplateItems,
} from "./packing-templates";
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

it("validates lifecycle parameters and rename bodies", async () => {
  const { getPackingTemplate, renamePackingTemplate, deletePackingTemplate } = await import("./packing-templates");
  for (const endpoint of [getPackingTemplate, renamePackingTemplate, deletePackingTemplate]) {
    expect(endpoint.params.parse({ templateId: uuid.toUpperCase() })).toEqual({ templateId: uuid });
    expect(endpoint.params.safeParse({ templateId: "bad" }).success).toBe(false);
  }
  expect(renamePackingTemplate.body.parse({ name: " Beach " })).toEqual({ name: "Beach" });
  for (const name of [" ", "x".repeat(FIELD_LIMITS.templateName + 1)])
    expect(renamePackingTemplate.body.safeParse({ name }).success).toBe(false);
  expect(deletePackingTemplate.status).toBe(204);
});

it("validates template item create, update, delete and section removal contracts", async () => {
  const {
    createPackingTemplateItem,
    updatePackingTemplateItem,
    deletePackingTemplateItem,
    removePackingTemplateSection,
  } = await import("./packing-templates");
  const other = "123e4567-e89b-12d3-a456-426614174001";
  expect(createPackingTemplateItem.path).toBe("/api/v1/packing-templates/:templateId/items");
  expect(createPackingTemplateItem.params.parse({ templateId: uuid.toUpperCase() })).toEqual({ templateId: uuid });
  expect(createPackingTemplateItem.body.parse({ id: uuid.toUpperCase(), text: " Hat ", labelId: other })).toEqual({
    id: uuid,
    text: "Hat",
    labelId: other,
  });
  for (const body of [
    { id: uuid, text: "  " },
    { id: uuid, text: "x".repeat(FIELD_LIMITS.packingItemText + 1) },
    { id: uuid, text: "Hat", extra: true },
    { text: "Hat" },
    { id: uuid, text: "Hat", beforeItemId: other, afterItemId: other },
    { id: uuid, text: "Zone", isLabel: true, labelId: other },
  ])
    expect(createPackingTemplateItem.body.safeParse(body).success).toBe(false);
  expect(updatePackingTemplateItem.body.parse({ text: " Cap " })).toEqual({ text: "Cap" });
  expect(updatePackingTemplateItem.body.safeParse({ text: "" }).success).toBe(false);
  expect(updatePackingTemplateItem.body.safeParse({ text: "Cap", extra: 1 }).success).toBe(false);
  for (const endpoint of [updatePackingTemplateItem, deletePackingTemplateItem, removePackingTemplateSection]) {
    expect(endpoint.params.parse({ itemId: uuid.toUpperCase() })).toEqual({ itemId: uuid });
    expect(endpoint.params.safeParse({ itemId: "bad" }).success).toBe(false);
  }
  expect(deletePackingTemplateItem.status).toBe(204);
  expect(deletePackingTemplateItem.body.safeParse({ extra: 1 }).success).toBe(false);
  expect(removePackingTemplateSection.status).toBe(204);
  expect(removePackingTemplateSection.body.parse({ mode: "delete-items" })).toEqual({ mode: "delete-items" });
  expect(removePackingTemplateSection.body.safeParse({ mode: "other" }).success).toBe(false);
});

it("validates complete reorder bodies and rejects duplicates", () => {
  expect(
    reorderPackingTemplateItems.body.safeParse({
      items: [{ id: uuid, labelId: null }],
      expectedItems: [{ id: uuid, labelId: null, position: 0 }],
    }).success
  ).toBe(true);
  expect(
    reorderPackingTemplateItems.body.safeParse({
      items: [
        { id: uuid, labelId: null },
        { id: uuid, labelId: null },
      ],
    }).success
  ).toBe(false);
});

it("requires a unique exact expected snapshot and permits templates over 1000 items", () => {
  const items = Array.from({ length: 1001 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    labelId: null,
  }));
  const expectedItems = items.map((item, position) => ({ ...item, position }));
  expect(reorderPackingTemplateItems.body.safeParse({ items, expectedItems }).success).toBe(true);
  expect(reorderPackingTemplateItems.body.safeParse({ items }).success).toBe(false);
  expect(
    reorderPackingTemplateItems.body.safeParse({ items, expectedItems: [expectedItems[0], expectedItems[0]] }).success
  ).toBe(false);
});
