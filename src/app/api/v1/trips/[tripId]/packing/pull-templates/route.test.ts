import { expect, it, vi } from "vitest";
const { pull, apiRoute } = vi.hoisted(() => ({
  pull: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/packing", () => ({ pullTemplatesOntoTrip: pull }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { POST } from "./route";
import { pullTemplatesOntoTrip } from "@/lib/api/contract/packing";
it("registers POST with the pull contract and Idempotency-Key opted in", () => {
  expect(apiRoute.mock.calls[0][0]).toBe(pullTemplatesOntoTrip);
  expect(apiRoute.mock.calls[0][1]).toBe(POST);
  expect(apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
});
it("forwards actor, trip, body and replay to the service", async () => {
  const input = {
    actor: { userId: "user" },
    params: { tripId: "trip" },
    body: { templateIds: ["template"], listId: null },
    replay: { key: "retry", method: "POST", path: "/api/v1/trips/trip/packing/pull-templates" },
  };
  pull.mockResolvedValue(input.body);
  await expect((POST as unknown as (input: unknown) => Promise<unknown>)(input)).resolves.toBe(input.body);
  expect(pull).toHaveBeenCalledWith(input.actor, "trip", input.body, input.replay);
});
