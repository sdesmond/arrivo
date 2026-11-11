import { expect, it, vi } from "vitest";
const { add, apiRoute } = vi.hoisted(() => ({
  add: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/days", () => ({ addDay: add }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { POST } from "./route";
import { addDay } from "@/lib/api/contract/days";
it("registers POST with the creation contract and Idempotency-Key opted in", () => {
  expect(apiRoute.mock.calls[0][0]).toBe(addDay);
  expect(apiRoute.mock.calls[0][1]).toBe(POST);
  expect(apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
});
it("forwards actor, trip, body and replay to the service", async () => {
  const input = {
    actor: { userId: "user" },
    params: { tripId: "trip" },
    body: { id: "day" },
    replay: { key: "retry", method: "POST", path: "/api/v1/trips/trip/days" },
  };
  add.mockResolvedValue({ id: "day" });
  await expect((POST as unknown as (input: unknown) => Promise<unknown>)(input)).resolves.toEqual({ id: "day" });
  expect(add).toHaveBeenCalledWith(input.actor, "trip", input.body, input.replay);
});
