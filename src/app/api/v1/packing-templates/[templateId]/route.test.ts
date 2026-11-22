import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  route: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/packing-templates", () => ({
  getPackingTemplate: mocks.detail,
  renamePackingTemplate: mocks.rename,
  deletePackingTemplate: mocks.remove,
}));
vi.mock("@/lib/api/route", () => ({ apiRoute: mocks.route }));
import { GET, PATCH, DELETE } from "./route";
import { renamePackingTemplate } from "@/lib/api/contract/packing-templates";
it("forwards lifecycle operations and enables rename replay", async () => {
  const actor = { userId: "user" },
    params = { templateId: "id" },
    body = { name: "Beach" },
    replay = { key: "k", method: "PATCH", path: "/x" };
  await (GET as unknown as (input: unknown) => Promise<unknown>)({ actor, params });
  await (PATCH as unknown as (input: unknown) => Promise<unknown>)({ actor, params, body, replay });
  await (DELETE as unknown as (input: unknown) => Promise<unknown>)({ actor, params });
  expect(mocks.detail).toHaveBeenCalledWith(actor, "id");
  expect(mocks.rename).toHaveBeenCalledWith(actor, "id", body, replay);
  expect(mocks.remove).toHaveBeenCalledWith(actor, "id");
  expect(mocks.route.mock.calls.find((call) => call[0] === renamePackingTemplate)?.[2]).toEqual({ idempotent: {} });
});
