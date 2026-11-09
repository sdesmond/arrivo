import { expect, it, vi } from "vitest";
const { update, remove, apiRoute } = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/checklists", () => ({ updateChecklistTitle: update, deleteChecklist: remove }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { PATCH, DELETE } from "./route";
import { updateChecklistTitle, deleteChecklist } from "@/lib/api/contract/checklists";
it("registers PATCH with its exact title contract", () => {
  expect(apiRoute.mock.calls[0][0]).toBe(updateChecklistTitle);
  expect(apiRoute.mock.calls[0][1]).toBe(PATCH);
  expect(apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
});
it("registers DELETE with its exact deletion contract", () => {
  expect(apiRoute.mock.calls[1][0]).toBe(deleteChecklist);
  expect(apiRoute.mock.calls[1][1]).toBe(DELETE);
  expect(apiRoute.mock.calls[1][2]).toEqual({ idempotent: {} });
});
it.each([
  ["PATCH", PATCH, update],
  ["DELETE", DELETE, remove],
] as const)("forwards %s with actor, checklist, body and replay", async (method, handler, service) => {
  const input = {
    actor: { userId: "user" },
    params: { checklistId: "list" },
    body: { tripId: "trip" },
    replay: { key: "retry", method, path: "/checklists/list" },
  };
  service.mockResolvedValue(null);
  await expect((handler as unknown as (input: unknown) => Promise<unknown>)(input)).resolves.toBeNull();
  expect(service).toHaveBeenCalledWith(input.actor, "list", input.body, input.replay);
});
