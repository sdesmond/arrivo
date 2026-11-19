import { expect, it } from "vitest";
import { updatePackingItem, deletePackingItem } from "./packing";
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
