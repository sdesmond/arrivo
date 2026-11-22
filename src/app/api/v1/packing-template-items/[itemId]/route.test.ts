import { expect, it, vi } from "vitest";
const { update, remove, apiRoute } = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/packing-template-items", () => ({
  updatePackingTemplateItem: update,
  deletePackingTemplateItem: remove,
}));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { PATCH, DELETE } from "./route";
import { updatePackingTemplateItem, deletePackingTemplateItem } from "@/lib/api/contract/packing-templates";
it("registers idempotent update and delete and forwards the requests", async () => {
  expect(apiRoute.mock.calls.map((call) => call[0])).toEqual([updatePackingTemplateItem, deletePackingTemplateItem]);
  for (const call of apiRoute.mock.calls) expect(call[2]).toEqual({ idempotent: {} });
  const input = {
    actor: { userId: "user" },
    params: { itemId: "item" },
    body: { text: "Cap" },
    replay: { key: "retry" },
  };
  await (PATCH as unknown as (input: unknown) => Promise<unknown>)(input);
  await (DELETE as unknown as (input: unknown) => Promise<unknown>)({ ...input, body: {} });
  expect(update).toHaveBeenCalledWith(input.actor, "item", input.body, input.replay);
  expect(remove).toHaveBeenCalledWith(input.actor, "item", {}, input.replay);
});
