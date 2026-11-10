import { expect, it, vi } from "vitest";
const { reorder, apiRoute } = vi.hoisted(() => ({
  reorder: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/days", () => ({ reorderDay: reorder }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { PUT } from "./route";
import { reorderDay } from "@/lib/api/contract/days";
it("registers PUT with the order contract and Idempotency-Key opted in", () => {
  expect(apiRoute.mock.calls[0][0]).toBe(reorderDay);
  expect(apiRoute.mock.calls[0][1]).toBe(PUT);
  expect(apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
});
it("forwards actor, day, body and replay to the service", async () => {
  const input = {
    actor: { userId: "user" },
    params: { dayId: "day" },
    body: { items: [{ type: "event", id: "event" }] },
    replay: { key: "retry", method: "PUT", path: "/api/v1/days/day/order" },
  };
  const result = { dayId: "day", items: input.body.items };
  reorder.mockResolvedValue(result);
  await expect((PUT as unknown as (input: unknown) => Promise<unknown>)(input)).resolves.toBe(result);
  expect(reorder).toHaveBeenCalledWith(input.actor, "day", input.body, input.replay);
});
