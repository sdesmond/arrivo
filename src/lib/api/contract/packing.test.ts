import { expect, it } from "vitest";
import { updatePackingItem, deletePackingItem, reorderPackingItems } from "./packing";
import { FIELD_LIMITS } from "@/lib/validation-limits";
const uuid = "123e4567-e89b-12d3-a456-426614174000";
it("validates normalized partial patches and strict input", () => {
  expect(updatePackingItem.params.parse({ itemId: uuid.toUpperCase() })).toEqual({ itemId: uuid });
  expect(updatePackingItem.body.parse({ name: " Boots ", isPacked: true })).toEqual({ name: "Boots", isPacked: true });
  expect(updatePackingItem.body.parse({})).toEqual({});
  for (const body of [
    { name: "  " },
    { name: "x".repeat(FIELD_LIMITS.packingItemText + 1) },
    { isPacked: "true" },
    { extra: true },
  ])
    expect(updatePackingItem.body.safeParse(body).success).toBe(false);
  expect(updatePackingItem.params.safeParse({ itemId: "bad" }).success).toBe(false);
});
it("requires a normalized trip ID for deletion", () => {
  expect(deletePackingItem.status).toBe(204);
  expect(deletePackingItem.body.parse({ tripId: uuid.toUpperCase() })).toEqual({ tripId: uuid });
  for (const body of [{}, { tripId: "bad" }, { tripId: uuid, extra: true }])
    expect(deletePackingItem.body.safeParse(body).success).toBe(false);
});
it("validates a complete ordered packing list", () => {
  expect(reorderPackingItems.method).toBe("PUT");
  expect(reorderPackingItems.params.parse({ tripId: uuid.toUpperCase() })).toEqual({ tripId: uuid });
  expect(reorderPackingItems.body.parse({ listId: null, items: [{ id: uuid.toUpperCase(), labelId: null }] })).toEqual({
    listId: null,
    items: [{ id: uuid, labelId: null }],
  });
  expect(reorderPackingItems.body.parse({ listId: uuid, items: [] }).items).toEqual([]);
});
it("rejects duplicate ids, bad shapes, extra fields and oversize lists", () => {
  const other = "123e4567-e89b-12d3-a456-426614174001";
  const item = { id: uuid, labelId: null };
  for (const body of [
    { listId: null, items: [item, { id: uuid, labelId: other }] },
    { listId: null },
    { items: [item] },
    { listId: "bad", items: [item] },
    { listId: null, items: [{ id: "bad", labelId: null }] },
    { listId: null, items: [{ id: uuid }] },
    { listId: null, items: [{ ...item, position: 1 }] },
    { listId: null, items: [item], extra: true },
    {
      listId: null,
      items: Array.from({ length: 1001 }, (_, index) => ({
        id: `123e4567-e89b-12d3-a456-${String(index).padStart(12, "0")}`,
        labelId: null,
      })),
    },
  ])
    expect(reorderPackingItems.body.safeParse(body).success).toBe(false);
  expect(reorderPackingItems.params.safeParse({ tripId: "bad" }).success).toBe(false);
});

it("validates packing creation and section removal", async () => {
  const { createPackingItem, removePackingSection } = await import("./packing");
  expect(createPackingItem.body.parse({ id: uuid, name: " Boots ", listId: null })).toMatchObject({
    id: uuid,
    name: "Boots",
    listId: null,
  });
  expect(
    createPackingItem.body.safeParse({ id: uuid, name: "Boots", listId: null, beforeItemId: uuid, afterItemId: uuid })
      .success
  ).toBe(false);
  expect(
    createPackingItem.body.safeParse({ id: uuid, name: "Section", listId: null, isLabel: true, labelId: uuid }).success
  ).toBe(false);
  expect(removePackingSection.body.safeParse({ tripId: uuid, mode: "delete-items" }).success).toBe(true);
  expect(removePackingSection.body.safeParse({ tripId: uuid, mode: "move-items-to-ungrouped" }).success).toBe(true);
  expect(removePackingSection.body.safeParse({ tripId: uuid, mode: "other" }).success).toBe(false);
});
it("validates packing list create, rename and delete", async () => {
  const { createPackingList, renamePackingList, deletePackingList } = await import("./packing");
  expect(createPackingList.body.parse({ id: uuid.toUpperCase(), name: " Beach " })).toEqual({
    id: uuid,
    name: "Beach",
  });
  expect(renamePackingList.body.parse({ tripId: uuid, name: " Day " })).toEqual({ tripId: uuid, name: "Day" });
  expect(renamePackingList.params.parse({ listId: uuid.toUpperCase() })).toEqual({ listId: uuid });
  expect(deletePackingList.status).toBe(204);
  expect(deletePackingList.body.parse({ tripId: uuid })).toEqual({ tripId: uuid });
  const long = "x".repeat(FIELD_LIMITS.packingListName + 1);
  for (const body of [{ id: uuid, name: "  " }, { id: uuid, name: long }, { id: "bad", name: "a" }, { name: "a" }])
    expect(createPackingList.body.safeParse(body).success).toBe(false);
  for (const body of [
    { tripId: uuid, name: "" },
    { tripId: uuid, name: long },
    { name: "a" },
    { tripId: uuid, name: "a", x: 1 },
  ])
    expect(renamePackingList.body.safeParse(body).success).toBe(false);
  expect(deletePackingList.body.safeParse({}).success).toBe(false);
  const overLimit = createPackingList.body.safeParse({ id: uuid, name: long });
  expect(overLimit.error?.issues[0].message).toBe(
    `List name must be ${FIELD_LIMITS.packingListName} characters or fewer.`
  );
});

it("validates strict template pulls and normalizes IDs", async () => {
  const { pullTemplatesOntoTrip } = await import("./packing");
  expect(pullTemplatesOntoTrip.body.parse({ templateIds: [uuid.toUpperCase()], listId: null })).toEqual({
    templateIds: [uuid],
    listId: null,
  });
  expect(pullTemplatesOntoTrip.body.parse({ templateIds: [] })).toEqual({ templateIds: [] });
  for (const body of [
    {},
    { templateIds: ["bad"] },
    { templateIds: [], listId: "bad" },
    { templateIds: [], extra: true },
  ])
    expect(pullTemplatesOntoTrip.body.safeParse(body).success).toBe(false);
});
