import { expect, it, vi } from "vitest";
const { update, apiRoute } = vi.hoisted(() => ({
  update: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/checklists", () => ({ updateChecklistItem: update }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { PATCH } from "./route";
const handler = PATCH as unknown as (input: unknown) => Promise<unknown>;
it("adapts the validated actor, id and body to the service", async () => {
  const input = { actor: { userId: "user" }, params: { itemId: "item" }, body: { isChecked: false } };
  update.mockResolvedValue({ id: "item", isChecked: false });
  await expect(handler(input)).resolves.toEqual({ id: "item", isChecked: false });
  expect(update).toHaveBeenCalledWith(input.actor, "item", input.body, undefined);
});
it("forwards replay metadata to the service", async () => {
  const replay = { key: "retry-1", method: "PATCH", path: "/api/v1/checklist-items/item" };
  const input = { actor: { userId: "user" }, params: { itemId: "item" }, body: { isChecked: true }, replay };
  update.mockResolvedValue({ id: "item", isChecked: true });
  await handler(input);
  expect(update).toHaveBeenLastCalledWith(input.actor, "item", input.body, replay);
});
it("opts in to Idempotency-Key replay", () => {
  expect(apiRoute).toHaveBeenCalledWith(expect.anything(), expect.any(Function), { idempotent: {} });
});
