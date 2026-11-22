import { expect, it, vi } from "vitest";
const { create, apiRoute } = vi.hoisted(() => ({
  create: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/packing-template-items", () => ({ createPackingTemplateItem: create }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { POST } from "./route";
import { createPackingTemplateItem } from "@/lib/api/contract/packing-templates";
it("registers an idempotent create and forwards the request", async () => {
  expect(apiRoute.mock.calls[0][0]).toBe(createPackingTemplateItem);
  expect(apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
  const input = {
    actor: { userId: "user" },
    params: { templateId: "template" },
    body: { id: "item", text: "Hat" },
    replay: { key: "retry" },
  };
  await (POST as unknown as (input: unknown) => Promise<unknown>)(input);
  expect(create).toHaveBeenCalledWith(input.actor, "template", input.body, input.replay);
});
