import { expect, it, vi } from "vitest";
const { reorder, apiRoute } = vi.hoisted(() => ({
  reorder: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/packing", () => ({ reorderPackingItems: reorder }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { PUT } from "./route";
import { reorderPackingItems } from "@/lib/api/contract/packing";
it("registers PUT with the order contract and Idempotency-Key opted in", () => {
  expect(apiRoute.mock.calls[0][0]).toBe(reorderPackingItems);
  expect(apiRoute.mock.calls[0][1]).toBe(PUT);
  expect(apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
});
it("forwards actor, trip, body and replay to the service", async () => {
  const input = {
    actor: { userId: "user" },
    params: { tripId: "trip" },
    body: { listId: null, items: [{ id: "item", labelId: null }] },
    replay: { key: "retry", method: "PUT", path: "/api/v1/trips/trip/packing/order" },
  };
  reorder.mockResolvedValue(input.body);
  await expect((PUT as unknown as (input: unknown) => Promise<unknown>)(input)).resolves.toBe(input.body);
  expect(reorder).toHaveBeenCalledWith(input.actor, "trip", input.body, input.replay);
});
