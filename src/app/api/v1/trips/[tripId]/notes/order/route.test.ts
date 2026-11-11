import { expect, it, vi } from "vitest";
const { reorder, apiRoute } = vi.hoisted(() => ({
  reorder: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/trip-notes", () => ({ reorderTripNotes: reorder }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { PUT } from "./route";
import { reorderTripNotes } from "@/lib/api/contract/trip-notes";
it("registers PUT with the order contract and Idempotency-Key opted in", () => {
  expect(apiRoute.mock.calls[0][0]).toBe(reorderTripNotes);
  expect(apiRoute.mock.calls[0][1]).toBe(PUT);
  expect(apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
});
it("forwards actor, trip, body and replay to the service", async () => {
  const input = {
    actor: { userId: "user" },
    params: { tripId: "trip" },
    body: { noteIds: ["note"] },
    replay: { key: "retry", method: "PUT", path: "/api/v1/trips/trip/notes/order" },
  };
  const result = { tripId: "trip", noteIds: ["note"] };
  reorder.mockResolvedValue(result);
  await expect((PUT as unknown as (input: unknown) => Promise<unknown>)(input)).resolves.toBe(result);
  expect(reorder).toHaveBeenCalledWith(input.actor, "trip", input.body, input.replay);
});
