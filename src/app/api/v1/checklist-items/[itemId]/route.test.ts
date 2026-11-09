import { expect, it, vi } from "vitest";
const { update, remove, apiRoute } = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/checklists", () => ({ updateChecklistItem: update, deleteChecklistItem: remove }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { PATCH, DELETE } from "./route";
import { updateChecklistItem, deleteChecklistItem } from "@/lib/api/contract/checklists";
const handler = PATCH as unknown as (input: unknown) => Promise<unknown>;
it("registers PATCH with its exact partial-update contract", () => {
  expect(apiRoute.mock.calls[0][0]).toBe(updateChecklistItem);
  expect(apiRoute.mock.calls[0][1]).toBe(PATCH);
  expect(apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
});
it("registers DELETE with its exact deletion contract, declared as 204", () => {
  expect(apiRoute.mock.calls[1][0]).toBe(deleteChecklistItem);
  expect(apiRoute.mock.calls[1][1]).toBe(DELETE);
  expect(apiRoute.mock.calls[1][2]).toEqual({ idempotent: {} });
  expect(deleteChecklistItem.status).toBe(204);
});
it("adapts the validated actor, id and body to the service", async () => {
  const input = { actor: { userId: "user" }, params: { itemId: "item" }, body: { isChecked: false } };
  update.mockResolvedValue({ id: "item", isChecked: false });
  await expect(handler(input)).resolves.toEqual({ id: "item", isChecked: false });
  expect(update).toHaveBeenCalledWith(input.actor, "item", input.body, undefined);
});
it("forwards partial content bodies untouched", async () => {
  const input = { actor: { userId: "user" }, params: { itemId: "item" }, body: { content: "Boots" } };
  update.mockResolvedValue({ id: "item" });
  await handler(input);
  expect(update).toHaveBeenLastCalledWith(input.actor, "item", { content: "Boots" }, undefined);
});
it.each([
  ["PATCH", PATCH, update, { isChecked: true }],
  ["DELETE", DELETE, remove, { tripId: "trip" }],
] as const)("forwards %s replay metadata to the service", async (method, route, service, body) => {
  const replay = { key: "retry-1", method, path: "/api/v1/checklist-items/item" };
  const input = { actor: { userId: "user" }, params: { itemId: "item" }, body, replay };
  service.mockResolvedValue(null);
  await (route as unknown as (input: unknown) => Promise<unknown>)(input);
  expect(service).toHaveBeenLastCalledWith(input.actor, "item", body, replay);
});
