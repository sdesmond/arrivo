import { expect, it, vi } from "vitest";
const { create, apiRoute } = vi.hoisted(() => ({
  create: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/checklists", () => ({ createChecklist: create }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { POST } from "./route";
import { createChecklist } from "@/lib/api/contract/checklists";
it("registers POST with its exact creation contract", () => {
  expect(apiRoute.mock.calls[0][0]).toBe(createChecklist);
  expect(apiRoute.mock.calls[0][1]).toBe(POST);
  expect(apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
});
it("forwards actor, trip, body and replay to creation service", async () => {
  const input = {
    actor: { userId: "user" },
    params: { tripId: "trip" },
    body: { dayId: "day", position: 0 },
    replay: { key: "retry", method: "POST", path: "/trip/checklists" },
  };
  create.mockResolvedValue({ id: "list" });
  await expect((POST as unknown as (input: unknown) => Promise<unknown>)(input)).resolves.toEqual({ id: "list" });
  expect(create).toHaveBeenCalledWith(input.actor, "trip", input.body, input.replay);
});
