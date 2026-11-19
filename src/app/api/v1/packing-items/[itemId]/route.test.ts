import { expect, it, vi } from "vitest";
const { update, remove, apiRoute } = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/packing", () => ({ updatePackingItem: update, deletePackingItem: remove }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { PATCH, DELETE } from "./route";
import { updatePackingItem, deletePackingItem } from "@/lib/api/contract/packing";
it.each([
  [PATCH, updatePackingItem, update, { isPacked: true }],
  [DELETE, deletePackingItem, remove, { tripId: "trip" }],
] as const)("registers and forwards validated requests and replay", async (route, contract, service, body) => {
  expect(apiRoute.mock.calls.find((call) => call[0] === contract)?.[2]).toEqual({ idempotent: {} });
  const replay = { key: "retry", method: "PATCH", path: "/test" };
  const actor = { userId: "user" };
  await (route as unknown as (input: unknown) => Promise<unknown>)({ actor, params: { itemId: "item" }, body, replay });
  expect(service).toHaveBeenCalledWith(actor, "item", body, replay);
});
