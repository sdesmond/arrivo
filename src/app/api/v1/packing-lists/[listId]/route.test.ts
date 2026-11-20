import { expect, it, vi } from "vitest";
const { rename, remove, apiRoute } = vi.hoisted(() => ({
  rename: vi.fn(),
  remove: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/packing", () => ({ renamePackingList: rename, deletePackingList: remove }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { PATCH, DELETE } from "./route";
import { renamePackingList, deletePackingList } from "@/lib/api/contract/packing";
it.each([
  [PATCH, renamePackingList, rename, { tripId: "trip", name: "Beach" }],
  [DELETE, deletePackingList, remove, { tripId: "trip" }],
] as const)("registers and forwards validated requests and replay", async (route, contract, service, body) => {
  expect(apiRoute.mock.calls.find((call) => call[0] === contract)?.[2]).toEqual({ idempotent: {} });
  const replay = { key: "retry", method: "PATCH", path: "/test" };
  const actor = { userId: "user" };
  await (route as unknown as (input: unknown) => Promise<unknown>)({ actor, params: { listId: "list" }, body, replay });
  expect(service).toHaveBeenCalledWith(actor, "list", body, replay);
});
