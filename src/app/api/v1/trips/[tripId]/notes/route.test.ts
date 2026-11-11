import { expect, it, vi } from "vitest";
const { create, apiRoute } = vi.hoisted(() => ({
  create: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/trip-notes", () => ({ createTripNote: create }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { POST } from "./route";
import { createTripNote } from "@/lib/api/contract/trip-notes";
it("registers POST with the creation contract and Idempotency-Key opted in", () => {
  expect(apiRoute.mock.calls[0][0]).toBe(createTripNote);
  expect(apiRoute.mock.calls[0][1]).toBe(POST);
  expect(apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
});
it("forwards actor, trip, body and replay to the service", async () => {
  const input = {
    actor: { userId: "user" },
    params: { tripId: "trip" },
    body: { id: "note", title: "Packing" },
    replay: { key: "retry", method: "POST", path: "/api/v1/trips/trip/notes" },
  };
  create.mockResolvedValue({ id: "note" });
  await expect((POST as unknown as (input: unknown) => Promise<unknown>)(input)).resolves.toEqual({ id: "note" });
  expect(create).toHaveBeenCalledWith(input.actor, "trip", input.body, input.replay);
});
