import { expect, it, vi } from "vitest";
const { create, apiRoute } = vi.hoisted(() => ({
  create: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/checklists", () => ({ createChecklistItem: create }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { POST } from "./route";
import { createChecklistItem } from "@/lib/api/contract/checklists";
const handler = POST as unknown as (input: unknown) => Promise<unknown>;
it("registers POST with its exact creation contract and replay opt-in", () => {
  expect(apiRoute.mock.calls[0][0]).toBe(createChecklistItem);
  expect(apiRoute.mock.calls[0][1]).toBe(POST);
  expect(apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
});
it("adapts the validated actor, checklist id and body to the service", async () => {
  const input = {
    actor: { userId: "user" },
    params: { checklistId: "list" },
    body: { id: "item", content: "Pack" },
  };
  create.mockResolvedValue({ id: "item", content: "Pack" });
  await expect(handler(input)).resolves.toEqual({ id: "item", content: "Pack" });
  expect(create).toHaveBeenCalledWith(input.actor, "list", input.body, undefined);
});
it("forwards replay metadata to the service", async () => {
  const replay = { key: "retry-1", method: "POST", path: "/api/v1/checklists/list/items" };
  const input = { actor: { userId: "user" }, params: { checklistId: "list" }, body: { content: "Pack" }, replay };
  create.mockResolvedValue({ id: "item" });
  await handler(input);
  expect(create).toHaveBeenLastCalledWith(input.actor, "list", input.body, replay);
});
