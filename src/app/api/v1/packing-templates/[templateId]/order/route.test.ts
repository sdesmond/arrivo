import { expect, it, vi } from "vitest";
const { reorder, apiRoute } = vi.hoisted(() => ({
  reorder: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/packing-template-items", () => ({ reorderPackingTemplateItems: reorder }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { PUT } from "./route";
import { reorderPackingTemplateItems } from "@/lib/api/contract/packing-templates";
it("registers an idempotent reorder and forwards the request", async () => {
  expect(apiRoute.mock.calls[0][0]).toBe(reorderPackingTemplateItems);
  expect(apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
  const input = {
    actor: { userId: "user" },
    params: { templateId: "template" },
    body: { items: [], expectedItems: [] },
    replay: { key: "retry" },
  };
  await (PUT as unknown as (input: unknown) => Promise<unknown>)(input);
  expect(reorder).toHaveBeenCalledWith(input.actor, "template", input.body, input.replay);
});
