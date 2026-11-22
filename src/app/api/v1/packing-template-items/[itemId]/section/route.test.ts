import { expect, it, vi } from "vitest";
const { remove, apiRoute } = vi.hoisted(() => ({
  remove: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/packing-template-items", () => ({ removePackingTemplateSection: remove }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { DELETE } from "./route";
import { removePackingTemplateSection } from "@/lib/api/contract/packing-templates";
it("registers an idempotent removal and forwards the request", async () => {
  expect(apiRoute.mock.calls[0][0]).toBe(removePackingTemplateSection);
  expect(apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
  const input = {
    actor: { userId: "user" },
    params: { itemId: "item" },
    body: { mode: "delete-items" },
    replay: { key: "retry" },
  };
  await (DELETE as unknown as (input: unknown) => Promise<unknown>)(input);
  expect(remove).toHaveBeenCalledWith(input.actor, "item", input.body, input.replay);
});
