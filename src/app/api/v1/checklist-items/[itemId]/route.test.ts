import { expect, it, vi } from "vitest";
const { update } = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/lib/services/checklists", () => ({ updateChecklistItem: update }));
vi.mock("@/lib/api/route", () => ({ apiRoute: (_endpoint: unknown, handler: (input: unknown) => unknown) => handler }));
import { PATCH } from "./route";
it("adapts the validated actor, id and body to the service", async () => {
  const input = { actor: { userId: "user" }, params: { itemId: "item" }, body: { isChecked: false } };
  update.mockResolvedValue({ id: "item", isChecked: false });
  const handler = PATCH as unknown as (input: unknown) => Promise<unknown>;
  await expect(handler(input)).resolves.toEqual({ id: "item", isChecked: false });
  expect(update).toHaveBeenCalledWith(input.actor, "item", input.body);
});
